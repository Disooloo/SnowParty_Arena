from django.db import migrations, models
import uuid
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0006_crashbet_cashed_out_at_crashbet_cashout_multiplier_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='device_type',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='player',
            name='ip_address',
            field=models.CharField(blank=True, max_length=45, null=True),
        ),
        migrations.AddField(
            model_name='player',
            name='is_connected',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='player',
            name='keys_bought',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='player',
            name='last_seen',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='player',
            name='prizes',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='player',
            name='user_agent',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='AdminUser',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('username', models.CharField(max_length=50, unique=True)),
                ('password_hash', models.CharField(max_length=128)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='RigOverride',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('value', models.FloatField()),
                ('apply_once', models.BooleanField(default=True)),
                ('consumed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('admin', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rigs', to='game.adminuser')),
                ('player', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='rig_overrides', to='game.player')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rig_overrides', to='game.session')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='PointsTransaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('amount', models.IntegerField()),
                ('reason', models.TextField(blank=True, null=True)),
                ('is_hidden', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('admin', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='transactions', to='game.adminuser')),
                ('player', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='game.player')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='game.session')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AdminToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('token', models.CharField(max_length=128, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('admin', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tokens', to='game.adminuser')),
            ],
        ),
        migrations.AddField(
            model_name='rigoverride',
            name='rig_type',
            field=models.CharField(choices=[('case', 'Кейс (число 1-20)'), ('multiplier', 'Множитель')], default='multiplier', max_length=20),
        ),
        migrations.AddField(
            model_name='rigoverride',
            name='round_number',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]

