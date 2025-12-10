from django.urls import path
from . import views

urlpatterns = [
    path('selfie/upload', views.upload_selfie, name='upload_selfie'),  # Важно: размещаем ПЕРЕД session для избежания конфликтов
    path('session', views.create_session, name='create_session'),
    path('session/<str:code>', views.get_session_state, name='get_session_state'),
    path('session/<str:code>/selfies', views.get_session_selfies, name='get_session_selfies'),
    path('session/<str:code>/join', views.join_session, name='join_session'),
    path('session/<str:code>/start', views.start_session, name='start_session'),
    path('progress', views.submit_progress, name='submit_progress'),
]


