import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from .models import Session, Player


class SessionConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer для комнаты сессии"""
    
    async def connect(self):
        self.session_code = self.scope['url_route']['kwargs']['session_code']
        self.room_group_name = f'session_{self.session_code}'
        
        print(f"WebSocket connection attempt for session: {self.session_code}")
        
        try:
            # Проверяем существование сессии ПЕРЕД принятием соединения
            session = await self.get_session()
            if not session:
                print(f"Session {self.session_code} not found")
                await self.close(code=4001)
                return
            
            # Принимаем соединение
            await self.accept()
            print(f"WebSocket accepted for session: {self.session_code}")
            
            # Присоединяемся к группе
            try:
                await self.channel_layer.group_add(
                    self.room_group_name,
                    self.channel_name
                )
                print(f"Added to group: {self.room_group_name}")
            except Exception as e:
                print(f"Error adding to group: {e}")
                import traceback
                traceback.print_exc()
                # Продолжаем даже если не удалось добавить в группу
            
            # Отправляем текущее состояние при подключении
            await self.send_initial_state()
            print(f"Initial state sent for session: {self.session_code}")
        except Exception as e:
            print(f"Error in connect: {e}")
            import traceback
            traceback.print_exc()
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'payload': {'message': 'Ошибка подключения'}
                }))
            except:
                pass
            try:
                await self.close(code=4002)
            except:
                pass
    
    async def disconnect(self, close_code):
        # Покидаем группу
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """Обработка входящих сообщений от клиента"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
            # Другие типы сообщений можно добавить здесь
            
        except json.JSONDecodeError:
            pass
    
    # Обработчики групповых сообщений (broadcast)
    
    async def session_state(self, event):
        """Отправка состояния сессии"""
        await self.send(text_data=json.dumps({
            'type': 'session.state',
            'payload': event['payload']
        }))
    
    async def players_list(self, event):
        """Отправка списка игроков"""
        await self.send(text_data=json.dumps({
            'type': 'players.list',
            'payload': event['payload']
        }))
    
    async def player_update(self, event):
        """Отправка обновления игрока"""
        await self.send(text_data=json.dumps({
            'type': 'player.update',
            'payload': event['payload']
        }))
    
    async def leaderboard_update(self, event):
        """Отправка обновления лидерборда"""
        await self.send(text_data=json.dumps({
            'type': 'leaderboard.update',
            'payload': event['payload']
        }))
    
    async def game_event(self, event):
        """Отправка игрового события"""
        await self.send(text_data=json.dumps({
            'type': 'game.event',
            'payload': event['payload']
        }))
    
    async def selfie_uploaded(self, event):
        """Отправка события загрузки селфи"""
        await self.send(text_data=json.dumps({
            'type': 'game.event',
            'payload': {
                'kind': 'selfie.uploaded',
                'data': event['payload']
            }
        }))
    
    # Вспомогательные методы
    
    async def send_initial_state(self):
        """Отправка начального состояния при подключении"""
        try:
            session = await self.get_session()
            if not session:
                return
            
            # Состояние сессии
            try:
                await self.send(text_data=json.dumps({
                    'type': 'session.state',
                    'payload': {
                        'session_id': str(session.id),
                        'code': session.code,
                        'status': session.status,
                    }
                }))
            except Exception as e:
                print(f"Error sending session.state: {e}")
            
            # Список игроков
            try:
                players = await self.get_players()
                await self.send(text_data=json.dumps({
                    'type': 'players.list',
                    'payload': {
                        'session_id': str(session.id),
                        'players': players
                    }
                }))
            except Exception as e:
                print(f"Error sending players.list: {e}")
            
            # Лидерборд
            try:
                leaderboard = await self.get_leaderboard()
                await self.send(text_data=json.dumps({
                    'type': 'leaderboard.update',
                    'payload': {
                        'session_id': str(session.id),
                        'leaderboard': leaderboard
                    }
                }))
            except Exception as e:
                print(f"Error sending leaderboard.update: {e}")
        except Exception as e:
            print(f"Error in send_initial_state: {e}")
            import traceback
            traceback.print_exc()
    
    @database_sync_to_async
    def get_session(self):
        try:
            return Session.objects.get(code=self.session_code)
        except Session.DoesNotExist:
            return None
    
    @database_sync_to_async
    def get_players(self):
        try:
            session = Session.objects.get(code=self.session_code)
            players = session.players.all()
            return [
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
        except Session.DoesNotExist:
            return []
    
    @database_sync_to_async
    def get_leaderboard(self):
        try:
            session = Session.objects.get(code=self.session_code)
            # Сортируем по total_score + bonus_score (final_score - это property, не поле БД)
            # Используем Python для сортировки по final_score, так как это вычисляемое свойство
            players_list = list(session.players.all())
            players_list.sort(key=lambda p: (p.total_score + p.bonus_score, p.total_score, -p.created_at.timestamp()), reverse=True)
            players = players_list
            return [
                {
                    'rank': idx + 1,
                    'player_id': str(p.id),
                    'name': p.name,
                    'total_score': p.total_score,
                    'bonus_score': p.bonus_score,
                    'final_score': p.final_score,
                    'current_level': p.current_level,
                    'status': p.status,
                }
                for idx, p in enumerate(players)
            ]
        except Session.DoesNotExist:
            return []


