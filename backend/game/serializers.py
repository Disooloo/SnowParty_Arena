from rest_framework import serializers
from .models import Session, Player, Progress


class SessionSerializer(serializers.ModelSerializer):
    players_count = serializers.IntegerField(source='players.count', read_only=True)
    
    class Meta:
        model = Session
        fields = ['id', 'code', 'status', 'created_at', 'started_at', 'ended_at',
                  'level_duration_seconds', 'min_players', 'auto_start', 'players_count']


class PlayerSerializer(serializers.ModelSerializer):
    final_score = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Player
        fields = ['id', 'name', 'device_uuid', 'token', 'status', 'current_level',
                  'total_score', 'bonus_score', 'final_score', 'created_at']


class ProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Progress
        fields = ['id', 'player', 'level', 'status', 'score', 'time_spent_ms',
                  'details', 'completed_at', 'created_at']


