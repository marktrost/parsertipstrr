let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('Парсер загружен - API версия');
    document.getElementById('parse-btn').addEventListener('click', parseData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
    
    // Включаем тестовые функции
    window.testAPI = testAPI;
    window.simpleTest = simpleTest;
});

// ================= ОСНОВНЫЕ ФУНКЦИИ =================
async function parseData() {
    console.log('✅ Кнопка "Парсить" нажата!');
    
    const url = document.getElementById('url-input').value;
    const count = parseInt(document.getElementById('count-select').value);
    
    showLoading(true);
    
    try {
        console.log('🚀 Начинаю парсинг...');
        
        // Извлекаем имя типстера из URL
        const tipsterMatch = url.match(/tipster\/([^\/]+)/);
        const tipsterName = tipsterMatch ? tipsterMatch[1] : 'freguli';
        
        // 1. Пробуем получить данные через API
        console.log('📡 Пробую API метод...');
        const apiUrl = `https://tipstrr.com/tipster/${tipsterName}/completed?skip=0&limit=${count}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('📦 API ответ:', data);
            
            if (data && data.length > 0) {
                parsedData = parseSimpleAPIData(data, count);
                console.log(`✅ Получено ${parsedData.length} прогнозов из API`);
            } else {
                throw new Error('API вернул пустой ответ');
            }
        } else {
            throw new Error(`API ошибка: ${response.status}`);
        }
        
    } catch (apiError) {
        console.log('⚠️ API не сработал:', apiError.message);
        console.log('🔄 Пробую HTML метод...');
        
        // 2. Резервный метод: парсинг HTML
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const html = await response.text();
            
            parsedData = parseTipsFromHTML(html, count);
            
            if (parsedData.length === 0) {
                console.log('⚠️ HTML парсинг не нашел данных');
                throw new Error('Нет данных');
            }
        } catch (htmlError) {
            console.log('❌ Все методы не сработали, загружаю демо');
            loadDemoData();
            return;
        }
    }
    
    showResults();
    document.getElementById('export-btn').disabled = parsedData.length === 0;
    
    alert(`✅ Готово! Найдено ${parsedData.length} прогнозов`);
    showLoading(false);
}

// ================= УПРОЩЕННЫЙ ПАРСИНГ API =================
function parseSimpleAPIData(apiData, limit) {
    const tips = [];
    
    if (!apiData || !Array.isArray(apiData)) {
        console.log('❌ API данные не являются массивом');
        return tips;
    }
    
    apiData.slice(0, limit).forEach((item, index) => {
        const tip = {};
        
        // 1. Дата добавления
        tip.addedDate = item.dateAdded || item.createdAt || '';
        
        // 2. Дата матча
        tip.matchDateTime = item.matchDate || item.eventDate || '';
        
        // 3. Название события
        tip.event = item.title || item.event || 'Неизвестный матч';
        
        // 4. Прогноз
        if (item.tipBetItem && item.tipBetItem[0]) {
            const bet = item.tipBetItem[0];
            tip.prediction = `${bet.marketText || ''} • ${bet.betText || ''}`;
        } else {
            tip.prediction = 'Прогноз';
        }
        
        // 5. Коэффициент
        tip.advisedOdds = item.odds || (item.tipBetItem && item.tipBetItem[0] && item.tipBetItem[0].finalOdds) || '';
        
        // 6. Ставка
        tip.stake = item.totalStake ? `£${item.totalStake}` : '';
        
        // 7. Результат
        if (item.result === 1) tip.result = 'won';
        else if (item.result === 0) tip.result = 'lost';
        else tip.result = 'void';
        
        // 8. Прибыль
        if (item.profit !== undefined) {
            tip.profit = item.profit >= 0 ? `+£${item.profit.toFixed(2)}` : `-£${Math.abs(item.profit).toFixed(2)}`;
        }
        
        tips.push(tip);
    });
    
    return tips;
}

// ================= HTML ПАРСИНГ =================
function parseTipsFromHTML(html, limit) {
    console.log('🔍 Парсинг HTML...');
    const tips = [];
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Ищем все контейнеры с прогнозами
        const containers = doc.querySelectorAll('article, [data-island*="FeedCard"], .block');
        
        console.log(`Найдено контейнеров: ${containers.length}`);
        
        containers.forEach((container, index) => {
            if (index >= limit) return;
            
            const text = container.textContent;
            
            // Пропускаем пустые контейнеры
            if (text.length < 100) return;
            
            const tip = {};
            
            // 1. Название события
            const eventMatch = text.match(/([A-Za-z0-9\s\-]+)\s+v(?:s|\.)?\s+([A-Za-z0-9\s\-]+)/);
            if (eventMatch) {
                tip.event = `${eventMatch[1]} v ${eventMatch[2]}`;
            }
            
            // 2. Дата
            const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})/);
            if (dateMatch) tip.addedDate = dateMatch[0];
            
            // 3. Коэффициент
            const oddsMatch = text.match(/\d+\.\d{2}/);
            if (oddsMatch) tip.advisedOdds = oddsMatch[0];
            
            // 4. Прогноз
            if (text.includes('Match winner')) tip.prediction = 'Match winner';
            else if (text.includes('Over')) tip.prediction = 'Over/Under';
            else if (text.includes('Both teams')) tip.prediction = 'Both teams to score';
            
            // 5. Ставка
            const stakeMatch = text.match(/£(\d+(?:\.\d{2})?)\s*stake/i);
            if (stakeMatch) tip.stake = `£${stakeMatch[1]}`;
            
            // 6. Результат
            if (text.includes('won')) tip.result = 'won';
            else if (text.includes('lost')) tip.result = 'lost';
            
            // 7. Прибыль
            const profitMatch = text.match(/[+-]£(\d+\.\d{2})/);
            if (profitMatch) tip.profit = profitMatch[0];
            
            if (tip.event) {
                tips.push(tip);
            }
        });
        
    } catch (error) {
        console.error('Ошибка HTML парсинга:', error);
    }
    
    return tips;
}

// ================= ПОКАЗ РЕЗУЛЬТАТОВ =================
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (!tbody || !countSpan) {
        console.error('Не найдены элементы таблицы');
        return;
    }
    
    if (!parsedData || parsedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
        countSpan.textContent = '0';
        return;
    }
    
    let html = '';
    
    parsedData.forEach(item => {
        html += `
            <tr>
                <td>${item.addedDate ? item.addedDate.substring(0, 10) : '-'}</td>
                <td>${item.matchDateTime ? item.matchDateTime.substring(0, 10) : '-'}</td>
                <td>${item.event || '-'}</td>
                <td>${item.prediction || '-'}</td>
                <td>${item.advisedOdds || '-'}</td>
                <td>${item.stake || '-'}</td>
                <td class="${item.result === 'won' ? 'success' : 'error'}">${item.result || '-'}</td>
                <td class="${item.profit && item.profit.startsWith('+') ? 'success' : 'error'}">${item.profit || '-'}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    countSpan.textContent = parsedData.length;
}

// ================= ЭКСПОРТ В EXCEL =================
function exportToExcel() {
    if (!parsedData || parsedData.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }
    
    try {
        const exportData = parsedData.map(item => ({
            'Дата добавления': item.addedDate || '',
            'Дата матча': item.matchDateTime || '',
            'Матч': item.event || '',
            'Прогноз': item.prediction || '',
            'Коэффициент': item.advisedOdds || '',
            'Ставка': item.stake || '',
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

// ================= ДЕМО-ДАННЫЕ =================
function loadDemoData() {
    parsedData = [];
    
    for (let i = 0; i < 8; i++) {
        const teams = ['Team A', 'Team B', 'Team C', 'Team D'];
        const team1 = teams[Math.floor(Math.random() * teams.length)];
        const team2 = teams[Math.floor(Math.random() * teams.length)];
        
        if (team1 === team2) continue;
        
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        parsedData.push({
            addedDate: date.toISOString(),
            matchDateTime: date.toISOString(),
            event: `${team1} v ${team2}`,
            prediction: 'Match winner • Home',
            advisedOdds: (Math.random() * 2 + 1.5).toFixed(2),
            stake: '£10.00',
            result: Math.random() > 0.5 ? 'won' : 'lost',
            profit: Math.random() > 0.5 ? '+£6.50' : '-£10.00'
        });
    }
    
    showResults();
    document.getElementById('export-btn').disabled = false;
}

// ================= ТЕСТОВЫЕ ФУНКЦИИ =================
async function testAPI() {
    console.clear();
    console.log('=== ТЕСТ API ===');
    
    try {
        const testUrl = 'https://tipstrr.com/tipster/freguli/completed?skip=0&limit=5';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(testUrl)}`;
        
        console.log('📡 Отправляю запрос...');
        const response = await fetch(proxyUrl);
        
        console.log('📊 Статус:', response.status, response.statusText);
        console.log('📦 Заголовки:', Object.fromEntries(response.headers.entries()));
        
        const data = await response.json();
        console.log('✅ Получены данные:', data);
        console.log('📐 Тип:', typeof data);
        console.log('🔢 Длина:', Array.isArray(data) ? data.length : 'не массив');
        
        if (Array.isArray(data) && data.length > 0) {
            console.log('📋 Первый элемент:', data[0]);
        }
        
        alert(`Тест завершен! Статус: ${response.status}\nСмотрите консоль.`);
        
    } catch (error) {
        console.error('❌ Ошибка теста:', error);
        alert('Ошибка теста: ' + error.message);
    }
}

async function simpleTest() {
    console.log('=== ПРОСТОЙ ТЕСТ ===');
    console.log('1. parsedData:', parsedData);
    console.log('2. parseData функция:', typeof parseData);
    console.log('3. Кнопка:', document.getElementById('parse-btn'));
    
    // Тест загрузки страницы
    const testUrl = 'https://tipstrr.com/tipster/freguli';
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(testUrl)}`;
    
    try {
        const response = await fetch(proxyUrl);
        console.log('4. Тест запроса:', response.status);
        
        if (response.ok) {
            const html = await response.text();
            console.log('5. HTML размер:', html.length);
            console.log('6. Содержит "tipster":', html.includes('tipster'));
            console.log('7. Содержит "completed":', html.includes('completed'));
        }
    } catch (e) {
        console.log('8. Ошибка запроса:', e.message);
    }
    
    alert('Тест завершен, смотрите консоль');
}

// ================= УТИЛИТЫ =================
function showLoading(show) {
    const loading = document.getElementById('loading');
    const btn = document.getElementById('parse-btn');
    
    if (!loading || !btn) {
        console.error('Не найдены элементы загрузки');
        return;
    }
    
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

// Авто-тест при загрузке
setTimeout(() => {
    console.log('=== ПАРСЕР ЗАГРУЖЕН ===');
    console.log('Доступные команды:');
    console.log('1. parseData() - основной парсинг');
    console.log('2. testAPI() - тест API');
    console.log('3. simpleTest() - простой тест');
    console.log('4. loadDemoData() - демо данные');
}, 1000);
// ====== ФУНКЦИЯ ДЛЯ ТОЧНОГО ПАРСИНГА ======
async function parseExactData() {
    console.log('🎯 Запускаю точный парсинг по шаблону...');
    showLoading(true);

    try {
        // 1. Загружаем страницу
        const url = document.getElementById('url-input').value;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const html = await response.text();

        // 2. Парсим HTML в объект для поиска
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 3. Находим ВСЕ статьи с прогнозами по точному селектору
        // (основываясь на структуре блока, который ты отправил)
        const feedArticles = doc.querySelectorAll('article.flex.w-full.flex-col');
        console.log(`🔍 Найдено статей (feedArticles): ${feedArticles.length}`);

        const allTips = [];

        // 4. Проходим по каждой статье и извлекаем данные
        feedArticles.forEach((article) => {
            const tipData = {};

            // Ищем данные по точным селекторам из твоего HTML
            const titleLink = article.querySelector('a[href*="/fixture/"]');
            const marketDt = article.querySelector('dt.text-xl');
            const oddsSpan = article.querySelector('span[data-odds]');
            const stakeElement = article.querySelector('stake'); // Селектор по тегу <stake>
            const resultDiv = article.querySelector('dl.bg-success-dark-2'); // Блок с результатом "won"
            const profitElement = article.querySelector('profit'); // Селектор по тегу <profit>
            const addedDateLink = article.querySelector('a[href*="/tips/"] time');
            const matchDateElement = article.querySelectorAll('local-date time')[1]; // Второй <time> в блоке

            // Заполняем объект, если нашли
            if (titleLink) {
                tipData.event = titleLink.textContent.trim(); // "Kocaelispor v Antalyaspor"
            }
            if (marketDt) {
                tipData.prediction = marketDt.textContent.trim(); // "Match winner • Kocaelispor"
            }
            if (oddsSpan) {
                tipData.advisedOdds = oddsSpan.getAttribute('data-odds') || oddsSpan.textContent; // "1.63"
            }
            if (stakeElement) {
                tipData.stake = stakeElement.textContent.replace('stake', '').trim(); // "£10"
            }
            if (resultDiv) {
                tipData.result = 'won'; // Если найден зеленый блок
            } else {
                tipData.result = 'lost'; // Предполагаем проигрыш, если его нет
            }
            if (profitElement) {
                tipData.profit = profitElement.textContent.trim(); // "+£6.32"
            }
            if (addedDateLink) {
                tipData.addedDate = addedDateLink.getAttribute('datetime'); // "2025-12-17T09:49:04.000Z"
            }
            if (matchDateElement) {
                tipData.matchDateTime = matchDateElement.getAttribute('datetime'); // "2025-12-19T17:00:00.000Z"
            }

            // Добавляем прогноз в итоговый массив, только если есть название события
            if (tipData.event) {
                allTips.push(tipData);
            }
        });

        console.log(`✅ Точно распарсено прогнозов: ${allTips.length}`);

        // 5. Показываем результаты
        if (allTips.length > 0) {
            window.parsedData = allTips;
            showResults();
            document.getElementById('export-btn').disabled = false;
            alert(`✅ Успех! На странице найдено ${allTips.length} реальных прогнозов.`);
        } else {
            alert('🤔 На странице не найдено структуры прогнозов. Возможно, изменилась вёрстка.');
        }

    } catch (error) {
        console.error('❌ Ошибка в точном парсере:', error);
        alert('Ошибка загрузки: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ====== ОБНОВЛЯЕМ ОБРАБОТЧИК КНОПКИ ======
// Убедись, что при загрузке страницы кнопка "Парсить" вызывает НОВУЮ функцию
document.addEventListener('DOMContentLoaded', function() {
    // ... остальной код инициализации ...

    // Перепривязываем кнопку на новую функцию
    const parseBtn = document.getElementById('parse-btn');
    if(parseBtn) {
        // Удаляем старый обработчик (если был через onclick в HTML)
        parseBtn.onclick = null;
        // Вешаем новый
        parseBtn.addEventListener('click', parseExactData);
    }
});
