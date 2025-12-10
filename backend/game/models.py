from django.db import models
import uuid
import json


class Session(models.Model):
    """Игровая сессия/вечеринка"""
    STATUS_CHOICES = [
        ('pending', 'Ожидание игроков'),
        ('active', 'Игра идёт'),
        ('finished', 'Завершена'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=6, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    
    # Настройки игры
    level_duration_seconds = models.IntegerField(default=300)  # 5 минут на уровень
    min_players = models.IntegerField(default=2)
    auto_start = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Session {self.code} ({self.status})"


class Player(models.Model):
    """Игрок"""
    STATUS_CHOICES = [
        ('ready', 'Готов'),
        ('playing', 'В игре'),
        ('done', 'Завершил'),
    ]
    
    LEVEL_CHOICES = [
        ('none', 'Не начал'),
        ('green', 'Зелёный'),
        ('yellow', 'Жёлтый'),
        ('red', 'Красный'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='players')
    name = models.CharField(max_length=100)
    device_uuid = models.UUIDField(db_index=True)  # Убрали default и editable=False, чтобы можно было передавать значение
    token = models.CharField(max_length=64, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ready')
    current_level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default='none')
    total_score = models.IntegerField(default=0)
    bonus_score = models.IntegerField(default=0)  # Бонусы из мини-игр
    role = models.CharField(max_length=50, blank=True, null=True)  # Роль игрока (Администратор, и т.д.)
    role_buff = models.IntegerField(default=0)  # Бонус от роли (баллы)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-total_score', '-bonus_score', 'created_at']
        unique_together = [['session', 'device_uuid']]
    
    def __str__(self):
        return f"{self.name} ({self.session.code})"
    
    @property
    def final_score(self):
        return self.total_score + self.bonus_score + self.role_buff


class Progress(models.Model):
    """Прогресс игрока по уровням"""
    LEVEL_CHOICES = [
        ('green', 'Зелёный'),
        ('yellow', 'Жёлтый'),
        ('red', 'Красный'),
    ]
    
    STATUS_CHOICES = [
        ('in_progress', 'В процессе'),
        ('completed', 'Завершён'),
        ('failed', 'Провален'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='progresses')
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    score = models.IntegerField(default=0)
    time_spent_ms = models.IntegerField(default=0)
    details = models.JSONField(default=dict, blank=True)  # Детали выполнения (правильные ответы, ошибки и т.п.)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['level', 'created_at']
        unique_together = [['player', 'level']]
    
    def __str__(self):
        return f"{self.player.name} - {self.level} ({self.status})"


def selfie_upload_path(instance, filename):
    """Генерация пути для сохранения селфи: session_code_datetime_name_selfie_id"""
    from django.utils import timezone
    import os
    # Получаем расширение файла
    ext = filename.split('.')[-1]
    # Формируем имя: session_code_datetime_name_selfie_id.ext
    session_code = instance.session.code  # Код сессии (например, RUBPSH)
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    safe_name = instance.player.name.replace(' ', '_').replace('/', '_')[:20]  # Безопасное имя
    selfie_id = str(instance.id)[:8]  # Первые 8 символов ID селфи
    new_filename = f"{session_code}_{timestamp}_{safe_name}_{selfie_id}.{ext}"
    return f'api/upload/{new_filename}'

class Selfie(models.Model):
    """Селфи игрока"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='selfies')
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='selfies')
    task = models.CharField(max_length=200)  # Задание для селфи
    image = models.ImageField(upload_to=selfie_upload_path)  # Сохраняем в api/upload с datetime-name-id
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.player.name} - {self.task}"


class LeaderboardSnapshot(models.Model):
    """Снимок лидерборда (для истории и отладки)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='snapshots')
    payload = models.JSONField()  # Список игроков с местами и очками
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']


class CrashGame(models.Model):
    """Игра Краш - история раундов"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='crash_games')
    multiplier = models.FloatField()  # Множитель на котором упал (например, 2.5)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=20)  # Длительность игры в секундах
    betting_phase_start = models.DateTimeField(null=True, blank=True)  # Время начала фазы ставок
    betting_phase_end = models.DateTimeField(null=True, blank=True)  # Время окончания фазы ставок
    
    # Provably Fair (честная игра)
    seed = models.CharField(max_length=64, null=True, blank=True)  # Случайный seed для генерации
    server_seed = models.CharField(max_length=64, null=True, blank=True)  # Серверный seed (скрытый)
    server_seed_hash = models.CharField(max_length=64, null=True, blank=True)  # Хэш серверного seed (показывается игрокам)
    nonce = models.IntegerField(default=0)  # Счетчик для уникальности
    
    class Meta:
        ordering = ['-started_at']
    
    def __str__(self):
        return f"Crash {self.session.code} - {self.multiplier}x"


class CrashBet(models.Model):
    """Ставка игрока в игре Краш"""
    STATUS_CHOICES = [
        ('pending', 'Ожидает'),
        ('cashed_out', 'Выведено'),
        ('won', 'Выиграл'),
        ('lost', 'Проиграл'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    crash_game = models.ForeignKey(CrashGame, on_delete=models.CASCADE, related_name='bets')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='crash_bets')
    multiplier = models.FloatField(null=True, blank=True)  # Авто-вывод на множитель (опционально)
    bet_amount = models.IntegerField(default=0)  # Сколько поставил (в баллах)
    win_amount = models.IntegerField(default=0)  # Сколько выиграл
    cashout_multiplier = models.FloatField(null=True, blank=True)  # На каком множителе вывел
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    cashed_out_at = models.DateTimeField(null=True, blank=True)  # Когда вывел
    
    class Meta:
        ordering = ['-created_at']
        unique_together = [['crash_game', 'player']]  # Один игрок - одна ставка на раунд
    
    def __str__(self):
        return f"{self.player.name} - {self.status}"

