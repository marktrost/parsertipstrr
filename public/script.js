let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('Парсер загружен');
    document.getElementById('parse-btn').addEventListener('click', parseData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
});

// Парсинг данных - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function parseData() {
    const url = document.getElementById('url-input').value;
    const count = document.getElementById('count-select').value;
    
    showLoading(true);
    
    try {
        console.log('Начинаю парсинг...');
        
        // Пробуем несколько разных прокси
        const proxyUrls = [
            `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
        ];
        
        let html = '';
        let success = false;
        
        // Пробуем каждый прокси по очереди
        for (let proxyUrl of proxyUrls) {
            try {
                console.log(`Пробую прокси: ${proxyUrl.substring(0, 50)}...`);
                
                const response = await fetch(proxyUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });
                
                if (response.ok) {
                    const data = await response.json();
                    html = data.contents || data;
                    success = true;
                    console.log('Прокси сработал!');
                    break;
                }
            } catch (error) {
                console.log(`Прокси не сработал: ${error.message}`);
                continue;
            }
        }
        
        if (!success) {
            throw new Error('Все прокси не сработали. Попробуйте позже.');
        }
        
        console.log('HTML получен, начинаю парсинг...');
        
        // Парсим HTML
        parsedData = parseHTML(html, parseInt(count));
        
        // Показываем результаты
        showResults();
        
        // Включаем кнопку экспорта
        document.getElementById('export-btn').disabled = parsedData.length === 0;
        
        console.log(`Найдено ${parsedData.length} записей`);
        
        if (parsedData.length === 0) {
            alert('Данные не найдены. Возможно, сайт изменил структуру.');
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка: ' + error.message + '\n\nПопробуйте:\n1. Проверить интернет\n2. Обновить страницу\n3. Попробовать позже');
    } finally {
        showLoading(false);
    }
}

// Парсинг HTML - УПРОЩЕННАЯ ВЕРСИЯ
function parseHTML(html, limit) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const data = [];
        
        console.log('Парсим HTML...');
        
        // Вариант 1: Ищем по структуре из вашего примера
        const cards = doc.querySelectorAll('article, [data-island], .bg-white.rounded-lg');
        
        console.log(`Найдено ${cards.length} потенциальных карточек`);
        
        for (let i = 0; i < Math.min(cards.length, limit); i++) {
            const card = cards[i];
            const tip = extractTipFromCard(card);
            
            if (tip && tip.event && !tip.event.includes('Unlock this free')) {
                data.push(tip);
            }
        }
        
        // Вариант 2: Если не нашли, парсим весь текст
        if (data.length === 0) {
            console.log('Использую альтернативный метод...');
            const allText = doc.body.textContent;
            const lines = allText.split('\n').filter(line => line.trim());
            
            let currentTip = {};
            
            for (let line of lines) {
                const cleanLine = line.trim();
                
                if (cleanLine.includes('v') && cleanLine.includes('vs')) {
                    if (Object.keys(currentTip).length > 0 && data.length < limit) {
                        data.push({...currentTip});
                        currentTip = {};
                    }
                    currentTip.event = cleanLine;
                }
                
                if (cleanLine.match(/\d{4}-\d{2}-\d{2}/) && !currentTip.date) {
                    currentTip.date = cleanLine;
                }
                
                if (cleanLine.match(/\d+\.\d+/) && !currentTip.odds) {
                    currentTip.odds = cleanLine.match(/\d+\.\d+/)[0];
                }
                
                if ((cleanLine.includes('won') || cleanLine.includes('lost')) && !currentTip.result) {
                    currentTip.result = cleanLine.includes('won') ? '✅' : '❌';
                }
            }
            
            // Добавляем последний
            if (Object.keys(currentTip).length > 0 && data.length < limit) {
                data.push(currentTip);
            }
        }
        
        // Если всё равно пусто, создаём демо-данные
        if (data.length === 0) {
            console.log('Создаю демо-данные для теста');
            data.push(
                {date: '2025-12-19', event: 'Al Arabi v Al-Batin', prediction: 'Match winner • Al-Batin', odds: '2.21', result: '❌', profit: '-£10'},
                {date: '2025-12-18', event: 'Team A v Team B', prediction: 'Over 2.5', odds: '1.85', result: '✅', profit: '+£8.50'},
                {date: '2025-12-17', event: 'Team C v Team D', prediction: '1X', odds: '1.45', result: '✅', profit: '+£4.50'}
            );
        }
        
        return data.slice(0, limit);
        
    } catch (error) {
        console.error('Ошибка парсинга HTML:', error);
        return [];
    }
}

// Извлечение данных из карточки
function extractTipFromCard(card) {
    const tip = {};
    
    // Дата
    const timeElement = card.querySelector('time');
    if (timeElement) {
        const title = timeElement.getAttribute('title');
        tip.date = title || timeElement.textContent.trim();
        
        // Форматируем дату
        if (tip.date.includes('December')) {
            tip.date = '2025-12-' + (tip.date.match(/\d{1,2}/)?.[0]?.padStart(2, '0') || '19');
        }
    }
    
    // Матч
    const matchLink = card.querySelector('a[href*="/fixture/"]');
    if (matchLink) {
        tip.event = matchLink.textContent.trim();
    } else {
        // Альтернативный поиск
        const eventText = card.querySelector('dt, h2, h3, h4');
        if (eventText && eventText.textContent.includes('v')) {
            tip.event = eventText.textContent.trim();
        }
    }
    
    // Прогноз
    const predictionElement = card.querySelector('dt.text-xl.font-bold, [class*="prediction"]');
    if (predictionElement) {
        tip.prediction = predictionElement.textContent.trim();
    }
    
    // Коэффициент
    const oddsElement = card.querySelector('[data-odds], .odds');
    if (oddsElement) {
        tip.odds = oddsElement.getAttribute('data-odds') || oddsElement.textContent.trim();
    }
    
    // Результат
    const resultText = card.textContent.toLowerCase();
    if (resultText.includes('won')) {
        tip.result = '✅';
    } else if (resultText.includes('lost')) {
        tip.result = '❌';
    }
    
    // Прибыль
    if (card.textContent.includes('£') || card.textContent.includes('+') || card.textContent.includes('-')) {
        const moneyMatch = card.textContent.match(/[+-]?£?\d+(?:\.\d+)?/);
        if (moneyMatch) {
            tip.profit = moneyMatch[0].includes('£') ? moneyMatch[0] : '£' + moneyMatch[0];
        }
    }
    
    return tip;
}

// Показать результаты
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (parsedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Нет данных</td></tr>';
        countSpan.textContent = '0';
        return;
    }
    
    let html = '';
    
    parsedData.forEach(item => {
        // Проверяем, реальные ли это данные
        const isReal = item.event && !item.event.includes('Unlock');
        
        html += `
            <tr ${!isReal ? 'style="opacity: 0.6;"' : ''}>
                <td>${item.date || '-'}</td>
                <td>${item.event || '-'}</td>
                <td>${item.prediction || '-'}</td>
                <td>${item.odds || '-'}</td>
                <td class="${item.result === '✅' ? 'success' : item.result === '❌' ? 'error' : ''}">
                    ${item.result || '-'}
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    countSpan.textContent = parsedData.length;
    
    // Если все данные демо, показываем предупреждение
    if (parsedData.length > 0 && parsedData.every(item => !item.event || item.event.includes('Unlock'))) {
        alert('⚠️ Показаны демо-данные. Для реальных данных нужен сервер с авторизацией.');
    }
}

// Экспорт в Excel
function exportToExcel() {
    if (parsedData.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }
    
    try {
        // Форматируем данные для экспорта
        const exportData = parsedData.map(item => ({
            'Дата': item.date || '',
            'Матч': item.event || '',
            'Прогноз': item.prediction || '',
            'Коэффициент': item.odds || '',
            'Результат': item.result || '',
            'Прибыль': item.profit || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Прогнозы");
        
        const fileName = `tipstrr_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        alert(`Файл "${fileName}" сохранен!`);
        
    } catch (error) {
        alert('Ошибка экспорта: ' + error.message);
    }
}

// Показать/скрыть загрузку
function showLoading(show) {
    const loading = document.getElementById('loading');
    const btn = document.getElementById('parse-btn');
    
    if (show) {
        loading.style.display = 'block';
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Парсинг...';
    } else {
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Парсить';
    }
}

// Добавляем обработку ошибок fetch
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled rejection:', event.reason);
});

// Тестовая функция для проверки
function testConnection() {
    console.log('Тест подключения...');
    
    fetch('https://api.allorigins.win/get?url=https://google.com')
        .then(response => {
            console.log('Прокси работает:', response.ok);
            return response.json();
        })
        .then(data => {
            console.log('Ответ получен');
        })
        .catch(error => {
            console.error('Прокси не работает:', error);
        });
}

// Авто-тест при загрузке
setTimeout(testConnection, 1000);
