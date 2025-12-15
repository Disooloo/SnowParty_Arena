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
    # Дополнительные данные для админки и аналитики
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)
    device_type = models.CharField(max_length=50, blank=True, null=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    is_connected = models.BooleanField(default=False)
    keys_bought = models.IntegerField(default=0)
    prizes = models.JSONField(default=list, blank=True)
    # Отслеживание прогресса в уровне
    current_green_game = models.IntegerField(default=0)  # Текущая игра в зеленом уровне (1-2)
    current_yellow_game = models.IntegerField(default=0)  # Текущая игра в желтом уровне (1-3)
    current_red_game = models.IntegerField(default=0)    # Текущая игра в красном уровне (1-3)
    played_bonus_games = models.JSONField(default=list, blank=True)  # Список пройденных бонусных игр
    
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


class AdminUser(models.Model):
    """Простой админ-пользователь для панели управления"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=50, unique=True)
    password_hash = models.CharField(max_length=128)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.username


class AdminToken(models.Model):
    """Токены для аутентификации в админке"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admin = models.ForeignKey(AdminUser, on_delete=models.CASCADE, related_name='tokens')
    token = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"Token for {self.admin.username}"


class PointsTransaction(models.Model):
    """История изменений баланса игрока (начисления/списания)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='transactions')
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='transactions')
    amount = models.IntegerField()  # + начисление, - списание
    reason = models.TextField(blank=True, null=True)
    is_hidden = models.BooleanField(default=False)  # Не показывать игроку
    created_at = models.DateTimeField(auto_now_add=True)
    admin = models.ForeignKey(AdminUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        sign = "+" if self.amount >= 0 else "-"
        return f"{self.player.name}: {sign}{abs(self.amount)}"


class RigOverride(models.Model):
    """Подкрутка результата (для ближайшей крутки/раунда)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='rig_overrides')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, null=True, blank=True, related_name='rig_overrides')
    value = models.FloatField()  # Какое значение должно выпасть (например, множитель или число)
    rig_type = models.CharField(max_length=20, default='multiplier', choices=[
        ('case', 'Кейс (число 1-20)'),
        ('multiplier', 'Множитель')
    ])
    round_number = models.IntegerField(null=True, blank=True)  # Для кейсов - номер раунда открытия
    apply_once = models.BooleanField(default=True)
    consumed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    admin = models.ForeignKey(AdminUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='rigs')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        target = self.player.name if self.player else "any"
        if self.rig_type == 'case':
            round_info = f" round #{self.round_number}" if self.round_number else ""
            return f"Case rig #{self.value}{round_info} for {self.session.code} ({target})"
        else:
            return f"Multiplier rig {self.value}x for {self.session.code} ({target})"

