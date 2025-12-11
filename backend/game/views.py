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
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Session, Player, Progress, Selfie, CrashGame, CrashBet
from .serializers import SessionSerializer, PlayerSerializer, ProgressSerializer


def generate_session_code():
    """Генерация 6-символьного кода сессии"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


def generate_player_token():
    """Генерация токена игрока"""
    return secrets.token_urlsafe(32)


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
    
    # Генерируем множитель с взвешенным распределением
    # 60% низкие (1.01-2.5), 25% средние (2.5-5.0), 10% высокие (5.0-10.0), 4% очень высокие (10.0-20.0), 1% экстремальные (20.0-50.0)
    if hash_float < 0.60:
        multiplier = round(1.01 + hash_float * (1.49 / 0.6), 2)
    elif hash_float < 0.85:
        multiplier = round(2.5 + (hash_float - 0.6) * (2.5 / 0.25), 2)
    elif hash_float < 0.95:
        multiplier = round(5.0 + (hash_float - 0.85) * (5.0 / 0.1), 2)
    elif hash_float < 0.99:
        multiplier = round(10.0 + (hash_float - 0.95) * (10.0 / 0.04), 2)
    else:
        multiplier = round(20.0 + (hash_float - 0.99) * (30.0 / 0.01), 2)
    
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


