import secrets
import string
import uuid
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Session, Player, Progress, Selfie
from .serializers import SessionSerializer, PlayerSerializer, ProgressSerializer


def generate_session_code():
    """Генерация 6-символьного кода сессии"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


def generate_player_token():
    """Генерация токена игрока"""
    return secrets.token_urlsafe(32)


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
    return Response(serializer.data)


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
            player.save()
        except Player.DoesNotExist:
            # Игрок не найден - проверяем, можно ли создать нового
            if session.status != 'pending':
                return Response(
                    {'error': 'Сессия уже началась или завершена. Новые игроки не могут присоединиться.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Игрок не найден, создаём нового
            player = Player.objects.create(
                session=session,
                device_uuid=device_uuid,
                name=name,
                token=generate_player_token(),
                status='ready',
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
    
    session = player.session
    if session.status != 'active':
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
        
        # Переход на следующий уровень
        if level == 'green':
            player.current_level = 'yellow'
        elif level == 'yellow':
            player.current_level = 'red'
        elif level == 'red':
            player.status = 'done'
            player.current_level = 'red'
        
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
                'final_score': p.final_score,
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
                    'final_score': player.final_score,
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
        players_list.sort(key=lambda p: (p.total_score + p.bonus_score, p.total_score, -p.created_at.timestamp()), reverse=True)
        players = players_list
        leaderboard = [
            {
                'rank': idx + 1,
                'player_id': str(p.id),
                'name': p.name,
                'total_score': p.total_score,
                'bonus_score': p.bonus_score,
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


