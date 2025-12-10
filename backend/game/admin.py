from django.contrib import admin
from .models import Session, Player, Progress, LeaderboardSnapshot


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ['code', 'status', 'created_at', 'started_at']
    list_filter = ['status', 'created_at']
    search_fields = ['code']


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ['name', 'session', 'status', 'current_level', 'total_score', 'bonus_score']
    list_filter = ['status', 'current_level', 'session']
    search_fields = ['name', 'session__code']


@admin.register(Progress)
class ProgressAdmin(admin.ModelAdmin):
    list_display = ['player', 'level', 'status', 'score', 'time_spent_ms']
    list_filter = ['level', 'status']
    search_fields = ['player__name']


@admin.register(LeaderboardSnapshot)
class LeaderboardSnapshotAdmin(admin.ModelAdmin):
    list_display = ['session', 'created_at']
    list_filter = ['created_at']
    search_fields = ['session__code']


