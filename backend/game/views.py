import secrets
import string
import uuid
import os
import random
from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.contrib.auth.hashers import check_password, make_password
from .models import (
    Session,
    Player,
    Progress,
    Selfie,
    CrashGame,
    CrashBet,
    AdminUser,
    AdminToken,
    PointsTransaction,
    RigOverride,
)
from .serializers import SessionSerializer, PlayerSerializer, ProgressSerializer


def generate_session_code():
    """Генерация 6-символьного кода сессии"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


def generate_player_token():
    """Генерация токена игрока"""
    return secrets.token_urlsafe(32)


def get_client_ip(request):
    """Извлекает IP из заголовков/соединения"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip or ''


def detect_device_type(user_agent: str):
    """Простейшее определение типа устройства по user-agent"""
    if not user_agent:
        return ''
    ua = user_agent.lower()
    if 'mobile' in ua or 'android' in ua or 'iphone' in ua:
        return 'mobile'
    if 'ipad' in ua or 'tablet' in ua:
        return 'tablet'
    if 'windows' in ua or 'macintosh' in ua or 'linux' in ua:
        return 'desktop'
    return 'unknown'


def create_admin_token(admin_user):
    token = secrets.token_urlsafe(48)
    expires_at = timezone.now() + timedelta(hours=12)
    AdminToken.objects.create(admin=admin_user, token=token, expires_at=expires_at)
    return token, expires_at


def get_admin_from_request(request):
    """Проверка админ-токена в заголовке Authorization: Bearer <token>"""
    auth_header = request.headers.get('Authorization') or ''
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ', 1)[1].strip()
    try:
        admin_token = AdminToken.objects.get(token=token)
        if admin_token.expires_at < timezone.now():
            return None
        return admin_token.admin
    except AdminToken.DoesNotExist:
        return None


def ensure_default_admin():
    """Гарантируем наличие дефолтного админа admin/disooloo"""
    admin, created = AdminUser.objects.get_or_create(
        username='admin',
        defaults={
            'password_hash': make_password('disooloo'),
            'is_active': True,
        }
    )
    return admin


@api_view(['POST'])
def admin_login(request):
    """Логин в админку, возвращает bearer-токен"""
    ensure_default_admin()
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    try:
        admin_user = AdminUser.objects.get(username=username, is_active=True)
    except AdminUser.DoesNotExist:
        return Response({'error': 'Неверные учетные данные'}, status=status.HTTP_401_UNAUTHORIZED)

    if not check_password(password, admin_user.password_hash):
        return Response({'error': 'Неверные учетные данные'}, status=status.HTTP_401_UNAUTHORIZED)

    token, expires_at = create_admin_token(admin_user)
    return Response({
        'token': token,
        'expires_at': expires_at.isoformat(),
        'admin': {'username': admin_user.username}
    })


@api_view(['GET'])
def admin_players(request):
    """Список игроков для админки (опционально фильтр active и session)"""
    admin_user = get_admin_from_request(request)
    if not admin_user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    session_code = request.GET.get('session')
    active_only = request.GET.get('active') in ['1', 'true', 'yes']
    qs = Player.objects.all().select_related('session')
    if session_code:
        qs = qs.filter(session__code=session_code)

    now = timezone.now()
    if active_only:
        active_threshold = now - timedelta(minutes=5)
        qs = qs.filter(Q(is_connected=True) | Q(last_seen__gte=active_threshold))

    players = []
    for p in qs.order_by('-created_at'):
        players.append({
            'id': str(p.id),
            'name': p.name,
            'session_code': p.session.code,
            'total_score': p.total_score,
            'bonus_score': p.bonus_score,
            'final_score': p.final_score,
            'status': p.status,
            'current_level': p.current_level,
            'last_seen': p.last_seen.isoformat() if p.last_seen else None,
            'is_connected': p.is_connected,
            'ip_address': p.ip_address,
            'device_type': p.device_type,
            'keys_bought': p.keys_bought,
        })

    return Response({'players': players})


@api_view(['GET'])
def admin_player_detail(request, player_id):
    """Детальная карточка игрока"""
    admin_user = get_admin_from_request(request)
    if not admin_user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    player = get_object_or_404(Player, id=player_id)
    transactions = [
        {
            'id': str(t.id),
            'amount': t.amount,
            'reason': t.reason,
            'is_hidden': t.is_hidden,
            'created_at': t.created_at.isoformat(),
            'admin': t.admin.username if t.admin else None,
        }
        for t in player.transactions.all().order_by('-created_at')[:50]
    ]

    data = {
        'id': str(player.id),
        'name': player.name,
        'session_code': player.session.code,
        'total_score': player.total_score,
        'bonus_score': player.bonus_score,
        'final_score': player.final_score,
        'status': player.status,
        'current_level': player.current_level,
        'ip_address': player.ip_address,
        'user_agent': player.user_agent,
        'device_type': player.device_type,
        'keys_bought': player.keys_bought,
        'prizes': player.prizes,
        'last_seen': player.last_seen.isoformat() if player.last_seen else None,
        'is_connected': player.is_connected,
        'transactions': transactions,
    }
    return Response(data)


def _broadcast_balance_change(player, amount, reason, is_hidden=False):
    """Отправляем уведомление об изменении баланса игроку и в сессию"""
    if is_hidden:
        return
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'session_{player.session.code}',
        {
            'type': 'player_balance_update',
            'payload': {
                'player_id': str(player.id),
                'amount': amount,
                'reason': reason,
            }
        }
    )


@api_view(['POST'])
def admin_adjust_points(request, player_id):
    """Добавить/забрать баллы у игрока"""
    admin_user = get_admin_from_request(request)
    if not admin_user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    player = get_object_or_404(Player, id=player_id)
    try:
        delta = int(request.data.get('delta', 0))
    except (TypeError, ValueError):
        return Response({'error': 'delta must be integer'}, status=status.HTTP_400_BAD_REQUEST)

    reason = request.data.get('reason', '').strip() or None
    is_hidden = bool(request.data.get('hidden', False))

    player.bonus_score += delta
    player.last_seen = timezone.now()
    player.save(update_fields=['bonus_score', 'last_seen'])

    PointsTransaction.objects.create(
        player=player,
        session=player.session,
        amount=delta,
        reason=reason,
        is_hidden=is_hidden,
        admin=admin_user
    )

    broadcast_player_update(player.session.code, player)
    broadcast_players_list(player.session.code)
    broadcast_leaderboard_update(player.session.code)
    _broadcast_balance_change(player, delta, reason, is_hidden=is_hidden)

    return Response({
        'success': True,
        'player': PlayerSerializer(player).data
    })


@api_view(['DELETE'])
def admin_delete_player(request, player_id):
    """Удаление игрока"""
    admin_user = get_admin_from_request(request)
    if not admin_user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    player = get_object_or_404(Player, id=player_id)

    # Сохраняем код сессии для обновления списков
    session_code = player.session.code

    # Удаляем игрока
    player.delete()

    # Отправляем обновления в сессию
    broadcast_players_list(session_code)
    broadcast_leaderboard_update(session_code)

    return Response({
        'success': True,
        'message': f'Игрок {player.name} удалён'
    })


@api_view(['POST'])
def admin_create_rig(request):
    """Создание подкрутки (rig) для следующей крутки/раунда"""
    admin_user = get_admin_from_request(request)
    if not admin_user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    session_code = request.data.get('session')
    value = request.data.get('value')
    player_id = request.data.get('player_id')
    apply_once = request.data.get('apply_once', True)
    rig_type = request.data.get('rig_type', 'multiplier')  # 'case' или 'multiplier'
    round_number = request.data.get('round_number')

    if session_code is None or value is None:
        return Response({'error': 'session и value обязательны'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        value = float(value)
    except (TypeError, ValueError):
        return Response({'error': 'value должен быть числом'}, status=status.HTTP_400_BAD_REQUEST)

    session = get_object_or_404(Session, code=session_code)
    player = None
    if player_id:
        player = get_object_or_404(Player, id=player_id, session=session)

    # Деактивируем предыдущие неиспользованные подкрутки для тех же условий
    RigOverride.objects.filter(
        session=session,
        consumed=False,
        player=player,
        rig_type=rig_type
    ).update(consumed=True)

    rig = RigOverride.objects.create(
        session=session,
        player=player,
        value=value,
        rig_type=rig_type,
        round_number=round_number if rig_type == 'case' else None,
        apply_once=bool(apply_once),
        admin=admin_user
    )

    return Response({
        'success': True,
        'rig_id': str(rig.id),
        'session': session.code,
        'value': rig.value,
        'rig_type': rig.rig_type,
        'round_number': rig.round_number,
        'player_id': str(player.id) if player else None,
        'apply_once': rig.apply_once,
    })


def get_player_role_and_buff(name):
    """Определение роли и бафа игрока по имени"""
    name_lower = name.lower().strip()
    
    # Роли и их бафы
    roles_config = {
        'администратор': {'role': 'Администратор', 'buff': 1000},
        'admin': {'role': 'Администратор', 'buff': 1000},
        'хост': {'role': 'Хост', 'buff': 500},
        'host': {'role': 'Хост', 'buff': 500},
        'ведущий': {'role': 'Ведущий', 'buff': 500},
        'модератор': {'role': 'Модератор', 'buff': 300},
        'moderator': {'role': 'Модератор', 'buff': 300},
        'vip': {'role': 'VIP', 'buff': 200},
        'вип': {'role': 'VIP', 'buff': 200},
    }
    
    # Проверяем точное совпадение
    if name_lower in roles_config:
        return roles_config[name_lower]['role'], roles_config[name_lower]['buff']
    
    # Проверяем частичное совпадение (если имя содержит роль)
    for key, value in roles_config.items():
        if key in name_lower:
            return value['role'], value['buff']
    
    # По умолчанию - обычный игрок
    return None, 0


@api_view(['POST'])
def create_session(request):
    """Создание новой игровой сессии"""
    code = generate_session_code()
    # Проверяем уникальность (маловероятно, но на всякий случай)
    while Session.objects.filter(code=code).exists():
        code = generate_session_code()
    
    session = Session.objects.create(
        code=code,
        level_duration_seconds=request.data.get('level_duration_seconds', 300),
        min_players=request.data.get('min_players', 2),
        auto_start=request.data.get('auto_start', True),  # По умолчанию автостарт включен
    )
    
    serializer = SessionSerializer(session)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def get_session_selfies(request, code):
    """Получение всех селфи для сессии"""
    try:
        session = Session.objects.get(code=code)
    except Session.DoesNotExist:
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    selfies = Selfie.objects.filter(session=session).order_by('-created_at')
    
    # Формируем полный URL для каждого изображения
    protocol = request.scheme or 'http'
    host = request.get_host() or 'localhost:8000'
    
    selfies_data = []
    for selfie in selfies:
        image_url = f"{protocol}://{host}{selfie.image.url}"
        selfies_data.append({
            'selfie_id': str(selfie.id),
            'player_id': str(selfie.player.id),
            'player_name': selfie.player.name,
            'task': selfie.task,
            'image_url': image_url,
            'created_at': selfie.created_at.isoformat()
        })
    
    return Response({
        'selfies': selfies_data
    })


@api_view(['GET'])
def get_session_state(request, code):
    """Получение состояния сессии"""
    try:
        session = Session.objects.get(code=code)
    except Session.DoesNotExist:
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND
        )
    serializer = SessionSerializer(session)
    session_data = serializer.data
    
    # Добавляем список игроков
    players = session.players.all()
    players_data = [
        {
            'id': str(p.id),
            'name': p.name,
            'status': p.status,
            'current_level': p.current_level,
            'total_score': p.total_score,
            'bonus_score': p.bonus_score,
            'role': p.role,
            'role_buff': p.role_buff,
            'final_score': p.final_score,
            'token': p.token,
        }
        for p in players
    ]
    session_data['players'] = players_data
    
    return Response(session_data)


@api_view(['POST'])
def join_session(request, code):
    """Регистрация игрока в сессии"""
    session = get_object_or_404(Session, code=code)
    
    name = request.data.get('name', '').strip()
    if not name or len(name) < 2:
        return Response(
            {'error': 'Имя должно содержать минимум 2 символа'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    device_uuid = request.data.get('device_uuid')
    if not device_uuid:
        return Response(
            {'error': 'device_uuid обязателен'},
            status=status.HTTP_400_BAD_REQUEST
        )

    ip_address = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    device_type = detect_device_type(user_agent)
    now = timezone.now()
    
    # Преобразуем device_uuid в UUID объект, если это строка
    try:
        import uuid as uuid_lib
        if isinstance(device_uuid, str):
            device_uuid = uuid_lib.UUID(device_uuid)
    except (ValueError, TypeError):
        return Response(
            {'error': 'Неверный формат device_uuid'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Проверяем, не зарегистрирован ли уже этот device
    try:
        # Сначала пытаемся найти существующего игрока
        try:
            player = Player.objects.get(session=session, device_uuid=device_uuid)
            created = False
            # Игрок уже существует - разрешаем вернуться даже если сессия активна
            # Обновляем имя и статус, если изменилось
            if player.name != name:
                player.name = name
            # Если сессия активна, сохраняем текущий статус игрока, иначе ставим ready
            if session.status == 'pending':
                player.status = 'ready'
            # Если сессия активна и игрок уже играл, не меняем его статус
            player.ip_address = ip_address or player.ip_address
            player.user_agent = user_agent or player.user_agent
            player.device_type = device_type or player.device_type
            player.last_seen = now
            player.is_connected = True
            player.save()
        except Player.DoesNotExist:
            # Игрок не найден - проверяем, можно ли создать нового
            if session.status != 'pending':
                return Response(
                    {'error': 'Сессия уже началась или завершена. Новые игроки не могут присоединиться.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Игрок не найден, создаём нового
            # Определяем роль и баф по имени
            role, role_buff = get_player_role_and_buff(name)
            
            player = Player.objects.create(
                session=session,
                device_uuid=device_uuid,
                name=name,
                token=generate_player_token(),
                status='ready',
                role=role,
                role_buff=role_buff,
                ip_address=ip_address,
                user_agent=user_agent,
                device_type=device_type,
                last_seen=now,
                is_connected=True,
            )
            created = True
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': f'Ошибка при создании игрока: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # Отправляем обновление через WebSocket
    broadcast_players_list(session.code)
    broadcast_leaderboard_update(session.code)
    
    # Проверяем, можно ли автоматически начать игру
    players_count = session.players.filter(status='ready').count()
    if session.auto_start and players_count >= session.min_players and session.status == 'pending':
        # Автоматически начинаем игру
        session.status = 'active'
        session.started_at = timezone.now()
        session.save()
        session.players.update(status='playing', current_level='green')
        broadcast_session_state(session.code)
        broadcast_players_list(session.code)
        broadcast_leaderboard_update(session.code)
        broadcast_game_event(session.code, 'game.started', {
            'message': 'Игра началась! Начинаем с зелёного уровня.'
        })
    
    serializer = PlayerSerializer(player)
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['POST'])
def start_session(request, code):
    """Старт игровой сессии"""
    session = get_object_or_404(Session, code=code)
    
    if session.status != 'pending':
        return Response(
            {'error': 'Сессия уже началась или завершена'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    players_count = session.players.count()
    if players_count < session.min_players:
        return Response(
            {'error': f'Недостаточно игроков. Минимум: {session.min_players}'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    session.status = 'active'
    session.started_at = timezone.now()
    session.save()
    
    # Обновляем статус всех игроков
    session.players.update(status='playing', current_level='green')
    
    # Отправляем события через WebSocket
    broadcast_session_state(session.code)
    broadcast_players_list(session.code)
    broadcast_leaderboard_update(session.code)
    broadcast_game_event(session.code, 'game.started', {
        'message': 'Игра началась! Начинаем с зелёного уровня.'
    })
    
    serializer = SessionSerializer(session)
    return Response(serializer.data)


@api_view(['POST'])
def submit_progress(request):
    """Отправка результата уровня или мини-игры"""
    token = request.data.get('token')
    if not token:
        return Response(
            {'error': 'Токен игрока обязателен'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        player = Player.objects.get(token=token)
    except Player.DoesNotExist:
        return Response(
            {'error': 'Неверный токен игрока'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    # Обновляем активность игрока
    player.last_seen = timezone.now()
    player.is_connected = True
    player.save(update_fields=['last_seen', 'is_connected'])

    session = player.session
    # Для казино (бонусных игр) разрешаем обновление даже если основная игра не активна
    is_minigame = request.data.get('is_minigame', False)
    level = request.data.get('level')
    is_casino = is_minigame or level == 'bonus' or level == 'slots'
    
    if not is_casino and session.status != 'active':
        return Response(
            {'error': 'Игра не активна'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    level = request.data.get('level')
    score = request.data.get('score', 0)
    time_spent_ms = request.data.get('time_spent_ms', 0)
    details = request.data.get('details', {})
    is_minigame = request.data.get('is_minigame', False)
    
    # Система баллов: зеленый 1б, желтый 5б, красный 10б, бонус 15б
    level_points = {
        'green': 1,
        'yellow': 5,
        'red': 10,
    }
    
    if is_minigame or level == 'bonus':
        # Мини-игра/бонусная игра: добавляем к бонусным очкам
        player.bonus_score += score  # Используем переданный score
        player.save()
        # Отправляем обновления через WebSocket
        broadcast_player_update(session.code, player)
        broadcast_players_list(session.code)  # Обновляем список игроков с актуальными очками
        broadcast_leaderboard_update(session.code)
    else:
        # Обычный уровень
        if level not in ['green', 'yellow', 'red']:
            return Response(
                {'error': f'Неверный уровень: {level}. Ожидается green, yellow, red или bonus с is_minigame=true'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        progress, created = Progress.objects.get_or_create(
            player=player,
            level=level,
            defaults={
                'status': 'completed',
                'score': score,
                'time_spent_ms': time_spent_ms,
                'details': details,
                'completed_at': timezone.now(),
            }
        )
        
        if not created:
            # Обновляем существующий прогресс (если игрок переиграл)
            progress.score = score
            progress.time_spent_ms = time_spent_ms
            progress.details = details
            progress.status = 'completed'
            progress.completed_at = timezone.now()
            progress.save()
        
        # Обновляем общий счёт и уровень игрока
        # Используем систему баллов: базовые очки умножаем на коэффициент уровня
        base_score = score  # Количество выполненных заданий
        level_multiplier = level_points.get(level, 1)
        final_score = base_score * level_multiplier
        
        progress.score = final_score
        progress.save()
        
        # Пересчитываем общий счёт из всех завершённых уровней
        player.total_score = sum(p.score for p in player.progresses.filter(status='completed'))
        
        # Переход на следующий уровень только если все игры уровня завершены
        # Проверяем количество завершенных игр в details
        game_number = details.get('game')
        if game_number:
            # Это одна из игр уровня, проверяем завершенность всего уровня
            if level == 'green' and game_number == 3:
                # Все 3 игры зеленого уровня завершены
                player.current_level = 'yellow'
            elif level == 'yellow' and game_number == 3:
                # Все 3 игры желтого уровня завершены
                player.current_level = 'red'
            elif level == 'red' and game_number == 3:
                # Все 3 игры красного уровня завершены
                player.status = 'done'
                player.current_level = 'red'
        # Если game_number нет, не меняем уровень (старая логика для совместимости)
        
        player.save()
    
    # Отправляем обновления через WebSocket
    broadcast_player_update(session.code, player)
    broadcast_players_list(session.code)  # Обновляем список игроков с актуальными очками
    broadcast_leaderboard_update(session.code)
    
    # Проверяем, завершена ли игра (все игроки прошли красный уровень)
    if all(p.status == 'done' or p.current_level == 'red' for p in session.players.all()):
        session.status = 'finished'
        session.ended_at = timezone.now()
        session.save()
        broadcast_session_state(session.code)
        broadcast_game_event(session.code, 'game.finished', {
            'message': 'Все игроки завершили игру!'
        })
    
    return Response({
        'success': True,
        'player': PlayerSerializer(player).data
    })


@api_view(['POST'])
def upload_selfie(request):
    """Загрузка селфи игрока"""
    print("=" * 50)
    print("📸 upload_selfie вызван!")
    print(f"Method: {request.method}")
    print(f"Path: {request.path}")
    print(f"POST data keys: {list(request.POST.keys())}")
    print(f"FILES keys: {list(request.FILES.keys())}")
    print("=" * 50)
    
    # Для FormData используем request.POST для текстовых данных
    token = request.POST.get('token') or request.data.get('token')
    if not token:
        return Response(
            {'error': 'Токен игрока обязателен'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        player = Player.objects.get(token=token)
    except Player.DoesNotExist:
        return Response(
            {'error': 'Неверный токен игрока'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    session = player.session
    task = request.POST.get('task', '') or request.data.get('task', '')
    image = request.FILES.get('image')
    
    if not image:
        return Response(
            {'error': 'Изображение обязательно'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Создаем запись о селфи (id будет сгенерирован автоматически)
    selfie = Selfie(
        player=player,
        session=session,
        task=task
    )
    selfie.id = uuid.uuid4()  # Генерируем ID заранее для использования в имени файла
    selfie.image = image  # Присваиваем изображение (путь будет сгенерирован функцией selfie_upload_path)
    selfie.save()
    
    # Формируем полный URL для изображения
    # Используем host из запроса, который уже содержит правильный IP для локальной сети
    protocol = request.scheme or 'http'
    host = request.get_host() or 'localhost:8000'
    
    # Если в host есть localhost, заменяем на IP из заголовка Host (если он был передан)
    # Обычно при запросе с телефона в локальной сети host уже содержит IP
    if 'localhost' in host or '127.0.0.1' in host:
        # Пытаемся использовать Host заголовок, который может содержать IP
        http_host = request.META.get('HTTP_HOST', '')
        if http_host and ('localhost' not in http_host and '127.0.0.1' not in http_host):
            host = http_host
    
    image_url = f"{protocol}://{host}{selfie.image.url}"
    print(f"📸 Сформирован URL для селфи: {image_url}")
    
    # Отправляем событие через WebSocket СРАЗУ
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'session_{session.code}',
        {
            'type': 'selfie_uploaded',
            'payload': {
                'player_id': str(player.id),
                'player_name': player.name,
                'task': task,
                'image_url': image_url,
                'selfie_id': str(selfie.id),
            }
        }
    )
    
    return Response({
        'success': True,
        'selfie_id': str(selfie.id),
        'image_url': image_url
    })


@api_view(['GET'])
def get_audio_tracks(request):
    """Получение списка аудио треков из папки media/audio"""
    try:
        # BASE_DIR указывает на backend/, поэтому поднимаемся на уровень выше
        project_root = settings.BASE_DIR.parent
        audio_dir = os.path.join(project_root, 'media', 'audio')
        
        # Проверяем существование папки
        if not os.path.exists(audio_dir):
            return Response({
                'tracks': [],
                'message': f'Папка с музыкой не найдена: {audio_dir}',
                'debug_path': audio_dir
            })
        
        # Получаем список всех аудио файлов
        audio_extensions = ['.mp3', '.ogg', '.wav', '.m4a', '.aac']
        tracks = []
        
        for filename in os.listdir(audio_dir):
            if any(filename.lower().endswith(ext) for ext in audio_extensions):
                # Формируем URL для доступа к файлу
                file_url = f"{settings.MEDIA_URL}audio/{filename}"
                # Очищаем имя файла от расширения для отображения
                name = os.path.splitext(filename)[0]
                tracks.append({
                    'filename': filename,
                    'url': file_url,
                    'name': name  # Полное имя без расширения
                })
        
        # Сортируем по имени файла
        tracks.sort(key=lambda x: x['filename'])
        
        return Response({
            'tracks': tracks,
            'count': len(tracks),
            'audio_dir': audio_dir  # Для отладки
        })
    except Exception as e:
        import traceback
        return Response({
            'tracks': [],
            'error': str(e),
            'traceback': traceback.format_exc()
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_crash_history(request, code):
    """Получение истории игр Краш для сессии"""
    try:
        session = Session.objects.get(code=code)
    except Session.DoesNotExist:
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    try:
        # Получаем последние 4 игры (только завершенные)
        games = CrashGame.objects.filter(session=session, ended_at__isnull=False).order_by('-started_at')[:4]
        
        history = []
        for game in games:
            history.append({
                'multiplier': game.multiplier,
                'started_at': game.started_at.isoformat() if game.started_at else None
            })
        
        return Response({
            'history': history,
            'count': len(history)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': f'Ошибка получения истории: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def get_current_crash_game(request, code):
    """Получение текущей активной игры Краш"""
    try:
        session = Session.objects.get(code=code)
    except Session.DoesNotExist:
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    try:
        # Ищем активную игру (без ended_at)
        game = CrashGame.objects.filter(session=session, ended_at__isnull=True).latest('started_at')
        return Response({
            'game_id': str(game.id),
            'multiplier': game.multiplier,
            'started_at': game.started_at.isoformat() if game.started_at else None,
            'is_active': True,
            'duration_seconds': game.duration_seconds if hasattr(game, 'duration_seconds') else 20,
            'server_seed_hash': game.server_seed_hash if hasattr(game, 'server_seed_hash') else None,
            'nonce': game.nonce if hasattr(game, 'nonce') else None
        })
    except CrashGame.DoesNotExist:
        return Response({
            'game_id': None,
            'multiplier': None,
            'is_active': False
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': f'Ошибка получения текущей игры: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def create_crash_game(request, code):
    """Создание новой игры Краш с Provably Fair"""
    import hashlib
    
    try:
        session = Session.objects.get(code=code)
    except Session.DoesNotExist:
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Проверяем, есть ли уже активная игра
    active_game = CrashGame.objects.filter(
        session=session,
        ended_at__isnull=True
    ).first()
    
    if active_game:
        return Response({
            'game_id': str(active_game.id),
            'multiplier': active_game.multiplier,
            'is_active': True,
            'duration_seconds': active_game.duration_seconds,
            'server_seed_hash': active_game.server_seed_hash,
            'nonce': active_game.nonce
        })
    
    # Provably Fair: генерируем серверный seed и его хэш
    server_seed = secrets.token_hex(32)  # 64 символа
    server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
    
    # Получаем последний nonce для этой сессии
    last_game = CrashGame.objects.filter(session=session).order_by('-nonce').first()
    nonce = (last_game.nonce + 1) if last_game and last_game.nonce else 1
    
    # Генерируем краш-коэффициент через SHA-256 для честности
    # Используем server_seed + nonce для генерации
    hmac_input = f"{server_seed}:{nonce}".encode()
    hmac_hash = hashlib.sha256(hmac_input).hexdigest()
    
    # Преобразуем хэш в число от 0 до 1
    hash_int = int(hmac_hash[:8], 16)  # Берем первые 8 символов
    hash_float = hash_int / (16 ** 8)  # Нормализуем до 0-1

    # Проверяем подкрутку (rig) перед расчётом случайного множителя
    rig = RigOverride.objects.filter(session=session, consumed=False).order_by('-created_at').first()
    multiplier = None
    if rig:
        multiplier = round(float(rig.value), 2)
        if rig.apply_once:
            rig.consumed = True
            rig.save(update_fields=['consumed'])
    else:
        # Генерируем множитель с взвешенным распределением
        # 70% низкие (1.00-2.0), 20% средние (2.0-4.0), 7% высокие (4.0-8.0), 2.5% очень высокие (8.0-15.0), 0.5% экстремальные (15.0-50.0)
        if hash_float < 0.70:
            # 70% вероятность: 1.00 - 2.0
            multiplier = round(1.00 + (hash_float / 0.70) * 1.0, 2)
        elif hash_float < 0.90:
            # 20% вероятность: 2.0 - 4.0
            multiplier = round(2.0 + ((hash_float - 0.70) / 0.20) * 2.0, 2)
        elif hash_float < 0.97:
            # 7% вероятность: 4.0 - 8.0
            multiplier = round(4.0 + ((hash_float - 0.90) / 0.07) * 4.0, 2)
        elif hash_float < 0.995:
            # 2.5% вероятность: 8.0 - 15.0
            multiplier = round(8.0 + ((hash_float - 0.97) / 0.025) * 7.0, 2)
        else:
            # 0.5% вероятность: 15.0 - 50.0
            multiplier = round(15.0 + ((hash_float - 0.995) / 0.005) * 35.0, 2)
    
    # Ограничиваем максимум 50.0
    multiplier = min(multiplier, 50.0)
    
    # Генерируем случайную длительность игры (20-40 секунд)
    duration_seconds = random.randint(20, 40)
    
    game = CrashGame.objects.create(
        session=session,
        multiplier=multiplier,
        duration_seconds=duration_seconds,
        betting_phase_start=timezone.now(),
        betting_phase_end=timezone.now() + timedelta(seconds=10),
        server_seed=server_seed,
        server_seed_hash=server_seed_hash,
        nonce=nonce
    )
    
    return Response({
        'game_id': str(game.id),
        'multiplier': multiplier,  # Финальное число, до которого будет идти игра
        'is_active': False,
        'duration_seconds': duration_seconds,
        'server_seed_hash': server_seed_hash,  # Показываем хэш игрокам для проверки
        'nonce': nonce,
        'started_at': game.started_at.isoformat()
    })


@api_view(['POST'])
def cashout_crash_bet(request):
    """Вывод ставки во время игры (cashout)"""
    try:
        data = request.data
        token = data.get('token')
        bet_id = data.get('bet_id')
        current_multiplier = float(data.get('current_multiplier', 1.0))
        
        if not token or not bet_id:
            return Response(
                {'error': 'Токен и ID ставки обязательны'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        player = get_object_or_404(Player, token=token)
        bet = get_object_or_404(CrashBet, id=bet_id, player=player)
        
        # Проверяем, что ставка еще активна
        if bet.status != 'pending':
            return Response(
                {'error': 'Ставка уже обработана'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверяем, что игра еще не закончилась
        if bet.crash_game.ended_at:
            return Response(
                {'error': 'Игра уже завершена'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Вычисляем выигрыш
        win_amount = int(bet.bet_amount * current_multiplier)
        bet.win_amount = win_amount
        bet.status = 'cashed_out'
        bet.cashout_multiplier = current_multiplier
        bet.cashed_out_at = timezone.now()
        bet.save()
        
        # Обновляем бонусные очки игрока (ставка возвращается + выигрыш)
        bet.player.bonus_score += bet.bet_amount + win_amount
        bet.player.save()
        
        return Response({
            'bet_id': str(bet.id),
            'cashout_multiplier': current_multiplier,
            'win_amount': win_amount,
            'total_payout': bet.bet_amount + win_amount,
            'status': bet.status
        })
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
def place_crash_bet(request):
    """Размещение ставки в игре Краш"""
    try:
        token = request.data.get('token')
        if not token:
            return Response(
                {'error': 'Токен обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        player = get_object_or_404(Player, token=token)
        
        game_id = request.data.get('game_id')
        if not game_id:
            return Response(
                {'error': 'game_id обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            game = CrashGame.objects.get(id=game_id)
        except CrashGame.DoesNotExist:
            return Response(
                {'error': 'Игра не найдена'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем, что игра еще активна
        if game.ended_at:
            return Response(
                {'error': 'Игра уже завершена'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверяем, не делал ли игрок уже ставку
        if CrashBet.objects.filter(crash_game=game, player=player).exists():
            return Response(
                {'error': 'Вы уже сделали ставку в этом раунде'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        multiplier = request.data.get('multiplier')
        if not multiplier:
            return Response(
                {'error': 'Множитель обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            multiplier = float(multiplier)
            if multiplier < 1.01 or multiplier > 50:
                return Response(
                    {'error': 'Множитель должен быть от 1.01 до 50'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, TypeError):
            return Response(
                {'error': 'Неверный формат множителя'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bet_amount = request.data.get('bet_amount', 0)
        try:
            bet_amount = int(bet_amount)
            if bet_amount < 0:
                return Response(
                    {'error': 'Ставка не может быть отрицательной'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, TypeError):
            bet_amount = 0
        
        # Создаем ставку
        bet = CrashBet.objects.create(
            crash_game=game,
            player=player,
            multiplier=multiplier,
            bet_amount=bet_amount,
            status='pending'
        )
        
        return Response({
            'bet_id': str(bet.id),
            'multiplier': bet.multiplier,
            'bet_amount': bet.bet_amount,
            'status': bet.status
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def get_crash_bets(request, code):
    """Получение истории ставок игрока в игре Краш"""
    try:
        session = get_object_or_404(Session, code=code)
        token = request.GET.get('token')
        
        if not token:
            return Response(
                {'error': 'Токен игрока обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            player = Player.objects.get(session=session, token=token)
        except Player.DoesNotExist:
            return Response(
                {'error': 'Игрок не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Получаем последние ставки игрока
        bets = CrashBet.objects.filter(
            crash_game__session=session,
            player=player
        ).order_by('-created_at')[:20]
        
        bets_data = []
        for bet in bets:
            game = bet.crash_game
            bets_data.append({
                'bet_id': str(bet.id),
                'game_id': str(game.id),
                'player_name': player.name,
                'multiplier': bet.multiplier,
                'bet_amount': bet.bet_amount,
                'win_amount': bet.win_amount,
                'status': bet.status,
                'game_multiplier': game.multiplier if game.ended_at else None,
                'created_at': bet.created_at.isoformat(),
                'won': bet.status == 'won',
                'balance_before': player.final_score - (bet.win_amount if bet.status == 'won' else 0) + bet.bet_amount,
                'balance_after': player.final_score if bet.status == 'won' else player.final_score - bet.bet_amount,
            })
        
        return Response({
            'bets': bets_data,
            'total_bets': len(bets_data)
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def finish_crash_game(request, game_id):
    """Завершение игры Краш и подсчет выигрышей"""
    try:
        game = get_object_or_404(CrashGame, id=game_id)
        
        if game.ended_at:
            return Response(
                {'error': 'Игра уже завершена'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from django.utils import timezone
        game.ended_at = timezone.now()
        game.save()
        
        # Подсчитываем выигрыши
        bets = CrashBet.objects.filter(crash_game=game, status='pending')
        winners = []
        all_bets_info = []  # Информация о всех ставках для истории
        
        for bet in bets:
            bet_info = {
                'player_name': bet.player.name,
                'multiplier': bet.multiplier,
                'bet_amount': bet.bet_amount,
                'won': False
            }
            
            if bet.multiplier <= game.multiplier:
                # Игрок выиграл
                # Возвращаем ставку + выигрыш (ставка * множитель ставки)
                win_amount = int(bet.bet_amount * bet.multiplier)
                total_payout = bet.bet_amount + win_amount  # Ставка + выигрыш
                bet.win_amount = total_payout
                bet.status = 'won'
                bet.save()
                
                # Начисляем выигрыш игроку (ставка возвращается + выигрыш)
                player = bet.player
                player.bonus_score += total_payout
                player.save()
                
                bet_info['won'] = True
                bet_info['win_amount'] = total_payout
                bet_info['bet_returned'] = bet.bet_amount
                bet_info['profit'] = win_amount
                
                winners.append({
                    'player_id': str(player.id),
                    'player_name': player.name,
                    'multiplier': bet.multiplier,
                    'win_amount': total_payout,
                    'bet_returned': bet.bet_amount,
                    'profit': win_amount
                })
            else:
                # Игрок проиграл
                bet.status = 'lost'
                bet.save()
            
            all_bets_info.append(bet_info)
        
        # Отправляем обновление через WebSocket
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'session_{game.session.code}',
            {
                'type': 'crash_game_finished',
                'payload': {
                    'game_id': str(game.id),
                    'multiplier': game.multiplier,
                    'winners': winners
                }
            }
        )
        
        broadcast_leaderboard_update(game.session.code)
        
        return Response({
            'game_id': str(game.id),
            'multiplier': game.multiplier,
            'winners': winners,
            'winners_count': len(winners),
            'server_seed': game.server_seed,  # Показываем seed после завершения для проверки
            'server_seed_hash': game.server_seed_hash,
            'nonce': game.nonce
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Вспомогательные функции для broadcast через WebSocket

def broadcast_session_state(session_code):
    """Отправка состояния сессии всем подключённым клиентам"""
    try:
        session = Session.objects.get(code=session_code)
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'session_{session_code}',
            {
                'type': 'session_state',
                'payload': {
                    'session_id': str(session.id),
                    'code': session.code,
                    'status': session.status,
                    'started_at': session.started_at.isoformat() if session.started_at else None,
                    'ended_at': session.ended_at.isoformat() if session.ended_at else None,
                }
            }
        )
    except Session.DoesNotExist:
        pass


def broadcast_players_list(session_code):
    """Отправка списка игроков"""
    try:
        session = Session.objects.get(code=session_code)
        players = session.players.all()
        players_data = [
            {
                'id': str(p.id),
                'name': p.name,
                'status': p.status,
                'current_level': p.current_level,
                'total_score': p.total_score,
                'bonus_score': p.bonus_score,
                'role': p.role,
                'role_buff': p.role_buff,
                'final_score': p.final_score,
                'last_seen': p.last_seen.isoformat() if p.last_seen else None,
                'is_connected': p.is_connected,
            }
            for p in players
        ]
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'session_{session_code}',
            {
                'type': 'players_list',
                'payload': {
                    'session_id': str(session.id),
                    'players': players_data
                }
            }
        )
    except Session.DoesNotExist:
        pass


def broadcast_player_update(session_code, player):
    """Отправка обновления конкретного игрока"""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'session_{session_code}',
        {
            'type': 'player_update',
            'payload': {
                'session_id': str(player.session.id),
                'player': {
                    'id': str(player.id),
                    'name': player.name,
                    'status': player.status,
                    'current_level': player.current_level,
                    'total_score': player.total_score,
                    'bonus_score': player.bonus_score,
                    'role': player.role,
                    'role_buff': player.role_buff,
                    'final_score': player.final_score,
                    'last_seen': player.last_seen.isoformat() if player.last_seen else None,
                    'is_connected': player.is_connected,
                }
            }
        }
    )


def broadcast_leaderboard_update(session_code):
    """Отправка обновления лидерборда"""
    try:
        session = Session.objects.get(code=session_code)
        # Сортируем по total_score + bonus_score (final_score - это property, не поле БД)
        # Используем Python для сортировки по final_score, так как это вычисляемое свойство
        players_list = list(session.players.all())
        players_list.sort(key=lambda p: (p.total_score + p.bonus_score + p.role_buff, p.total_score, -p.created_at.timestamp()), reverse=True)
        players = players_list
        leaderboard = [
            {
                'rank': idx + 1,
                'player_id': str(p.id),
                'name': p.name,
                'total_score': p.total_score,
                'bonus_score': p.bonus_score,
                'role': p.role,
                'role_buff': p.role_buff,
                'final_score': p.final_score,  # Используем property для отправки клиенту
                'current_level': p.current_level,
                'status': p.status,
            }
            for idx, p in enumerate(players)
        ]
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'session_{session_code}',
            {
                'type': 'leaderboard_update',
                'payload': {
                    'session_id': str(session.id),
                    'leaderboard': leaderboard
                }
            }
        )
    except Session.DoesNotExist:
        pass


def broadcast_game_event(session_code, event_kind, payload):
    """Отправка игрового события"""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'session_{session_code}',
        {
            'type': 'game_event',
            'payload': {
                'kind': event_kind,
                'data': payload
            }
        }
    )


@api_view(['POST'])
def update_player_progress(request):
    """Обновление прогресса игрока"""
    try:
        player_token = request.data.get('player_token')
        if not player_token:
            return Response({'error': 'player_token required'}, status=status.HTTP_400_BAD_REQUEST)

        player = get_object_or_404(Player, token=player_token)

        # Обновляем уровень и игры
        if 'current_level' in request.data:
            player.current_level = request.data['current_level']
        if 'current_green_game' in request.data:
            player.current_green_game = request.data['current_green_game']
        if 'current_yellow_game' in request.data:
            player.current_yellow_game = request.data['current_yellow_game']
        if 'current_red_game' in request.data:
            player.current_red_game = request.data['current_red_game']
        if 'played_bonus_games' in request.data:
            player.played_bonus_games = request.data['played_bonus_games']

        player.save()

        # Отправляем обновления
        broadcast_players_list(player.session.code)
        broadcast_leaderboard_update(player.session.code)

        return Response({
            'success': True,
            'message': 'Прогресс обновлен'
        })

    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


