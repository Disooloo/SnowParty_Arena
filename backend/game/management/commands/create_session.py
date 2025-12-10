from django.core.management.base import BaseCommand
from game.models import Session


class Command(BaseCommand):
    help = 'Создать тестовую сессию'

    def add_arguments(self, parser):
        parser.add_argument('--code', type=str, help='Код сессии (опционально)')

    def handle(self, *args, **options):
        code = options.get('code')
        if code:
            session, created = Session.objects.get_or_create(code=code)
            if not created:
                self.stdout.write(self.style.WARNING(f'Сессия {code} уже существует'))
            else:
                self.stdout.write(self.style.SUCCESS(f'Создана сессия: {code}'))
        else:
            session = Session.objects.create()
            self.stdout.write(self.style.SUCCESS(f'Создана сессия: {session.code}'))
        
        self.stdout.write(f'URL для ТВ: http://localhost:5173/tv?session={session.code}')
        self.stdout.write(f'URL для игрока: http://localhost:5173/play?session={session.code}')


