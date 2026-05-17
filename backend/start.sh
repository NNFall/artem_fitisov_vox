#!/bin/bash
# Скрипт для запуска бэкенда на Linux сервере

# Переходим в директорию скрипта
cd "$(dirname "$0")"

# Проверяем наличие venv
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Активируем venv
source venv/bin/activate

# Устанавливаем/обновляем зависимости
echo "Checking requirements..."
pip install -r requirements.txt

# Запускаем сервер через uvicorn (в режиме продакшн без reload)
echo "Starting Artem Fitisov Backend..."
uvicorn main:app --host 0.0.0.0 --port 8000
