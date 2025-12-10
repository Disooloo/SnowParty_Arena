from django.urls import path
from . import views

urlpatterns = [
    path('selfie/upload', views.upload_selfie, name='upload_selfie'),  # Важно: размещаем ПЕРЕД session для избежания конфликтов
    path('audio/tracks', views.get_audio_tracks, name='get_audio_tracks'),
    path('session', views.create_session, name='create_session'),
    path('session/<str:code>', views.get_session_state, name='get_session_state'),
    path('session/<str:code>/selfies', views.get_session_selfies, name='get_session_selfies'),
    path('session/<str:code>/join', views.join_session, name='join_session'),
    path('session/<str:code>/start', views.start_session, name='start_session'),
    path('progress', views.submit_progress, name='submit_progress'),
    path('crash/<str:code>/history', views.get_crash_history, name='get_crash_history'),
    path('crash/<str:code>/current', views.get_current_crash_game, name='get_current_crash_game'),
    path('crash/<str:code>/create', views.create_crash_game, name='create_crash_game'),
    path('crash/bet', views.place_crash_bet, name='place_crash_bet'),
    path('crash/cashout', views.cashout_crash_bet, name='cashout_crash_bet'),
    path('crash/<str:game_id>/finish', views.finish_crash_game, name='finish_crash_game'),
]


