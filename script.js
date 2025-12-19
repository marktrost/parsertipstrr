// Конфигурация
const CONFIG = {
    corsProxy: 'https://corsproxy.io/?',
    mockData: [
        {
            date: '2023-10-15',
            event: 'Manchester United vs Liverpool',
            prediction: 'П1',
            odds: '2.10',
            result: '✅',
            profit: '+1.10'
        }
    ]
};

// Глобальные переменные
let parsedData = [];
let startTime = 0;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔥 Tipstrr Parser загружен');
    
    // Настройка toastr
    toastr.options = {
        positionClass: 'toast-top-right',
        progressBar: true,
        timeOut: 3000,
        closeButton: true
    };

    // События кнопок
    document.getElementById('parse-btn').addEventListener('click', startParsing);
    document.getElementById('clear-btn').addEventListener('click', clearData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
    document.getElementById('export-csv').addEventListener('click', exportToCSV);
    document.getElementById('export-json').addEventListener('click', exportToJSON);
    document.getElementById('export-print').addEventListener('click', printTable);
    
    // Примеры URL
    document.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const exampleUrl = 'https://tipstrr.com/tipster/freguli/results';
            document.getElementById('url-input').value = exampleUrl;
            toastr.info('URL вставлен', 'Пример загружен');
        });
    });

    // Тестовый URL по умолчанию
    document.getElementById('url-input').value = 'https://tipstrr.com/tipster/freguli/results';
});

// Парсинг данных - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function startParsing() {
    const url = document.getElementById('url-input').value.trim();
    const mode = document.getElementById('proxy-select').value;
    
    if (!url) {
        toastr.error('Введите URL страницы', 'Ошибка!');
        return;
    }

    // Показываем загрузку
    showLoading(true);
    startTime = Date.now(); // ИНИЦИАЛИЗАЦИЯ ВРЕМЕНИ
    
    try {
        console.log(`🚀 Начинаем парсинг: ${url}, режим: ${mode}`);
        
        let data = [];
        
        if (mode === 'mock') {
            // Тестовые данные
            data = CONFIG.mockData;
            toastr.info('Используются тестовые данные', 'Демо режим');
        } else {
            // Реальные данные
            data = await fetchRealTipstrrData(url, mode);
            
            if (data.length === 0) {
                toastr.warning('Не удалось получить данные', 'Проверьте URL');
                data = CONFIG.mockData; // fallback
            }
        }
        
        parsedData = data;
        
        if (parsedData.length > 0) {
            updateTable();
            updateStats();
            enableExportButtons();
            saveData();
            
            const parseTime = ((Date.now() - startTime) / 1000).toFixed(2);
            toastr.success(`Найдено ${parsedData.length} записей за ${parseTime} сек`, 'Успех!');
        } else {
            toastr.warning('Данные не найдены', 'Внимание');
        }
        
    } catch (error) {
        console.error('❌ Ошибка парсинга:', error);
        toastr.error(`Ошибка: ${error.message}`, 'Проблема!');
        
        // Показываем тестовые данные
        parsedData = CONFIG.mockData;
        updateTable();
        updateStats();
        enableExportButtons();
        
    } finally {
        showLoading(false);
    }
}

// Загрузка реальных данных с tipstrr - РАБОЧАЯ ВЕРСИЯ
async function fetchRealTipstrrData(url, mode) {
    console.log(`📡 Загружаем данные из: ${url}`);
    
    try {
        let html = '';
        
        if (mode === 'corsproxy') {
            // Используем corsproxy.io - более надежный прокси
            const proxyUrl = `${CONFIG.corsProxy}${encodeURIComponent(url)}`;
            console.log(`🔄 Используем прокси: ${proxyUrl}`);
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            html = await response.text();
            
        } else if (mode === 'direct') {
            // Прямой запрос (вряд ли сработает из-за CORS)
            console.log('⚠️ Прямой запрос - может не сработать из-за CORS');
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            html = await response.text();
        }
        
        console.log(`✅ HTML получен, размер: ${html.length} символов`);
        
        // Парсим данные
        const data = parseTipstrrHTML(html);
        console.log(`📊 Распарсено записей: ${data.length}`);
        
        return data;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        throw error;
    }
}

// Парсинг HTML tipstrr - РЕАЛЬНЫЙ ПАРСЕР
function parseTipstrrHTML(html) {
    console.log('🔍 Начинаем парсинг HTML...');
    
    const data = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    try {
        // ПЕРВЫЙ МЕТОД: Ищем карточки прогнозов
        const tipCards = doc.querySelectorAll('article.flex.w-full.flex-col, .bg-white.rounded-lg.shadow-lg, [data-island*="FeedCard"]');
        console.log(`Найдено карточек: ${tipCards.length}`);
        
        if (tipCards.length > 0) {
            tipCards.forEach((card, index) => {
                try {
                    const tip = parseTipCard(card);
                    if (tip && tip.event) {
                        data.push(tip);
                    }
                } catch (e) {
                    console.warn(`Ошибка в карточке ${index}:`, e);
                }
            });
        }
        
        // ВТОРОЙ МЕТОД: Альтернативные селекторы
        if (data.length === 0) {
            console.log('🔄 Пробуем альтернативные селекторы...');
            
            // Ищем все элементы с данными о ставках
            const allTips = doc.querySelectorAll('article, div[class*="card"], div[class*="tip"]');
            allTips.forEach(element => {
                const tip = parseAnyTipElement(element);
                if (tip && tip.event) {
                    data.push(tip);
                }
            });
        }
        
        // Если ничего не нашли, парсим всю страницу
        if (data.length === 0 && html.includes('tipstrr')) {
            console.log('🔄 Парсим всю страницу...');
            const tipsFromPage = parseWholePage(doc);
            data.push(...tipsFromPage);
        }
        
        console.log(`🎯 Всего распарсено: ${data.length} записей`);
        
        // Если данных нет, возвращаем пустой массив
        return data;
        
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML:', error);
        return [];
    }
}

// Парсим карточку прогноза
function parseTipCard(card) {
    const tip = {};
    
    // 1. Дата и время
    const timeElement = card.querySelector('time');
    if (timeElement) {
        tip.date = timeElement.getAttribute('title') || timeElement.textContent.trim();
        // Форматируем дату
        tip.date = formatDate(tip.date);
    }
    
    // 2. Событие (матч)
    const eventLink = card.querySelector('a[href*="/fixture/"], a[href*="fixture"]');
    if (eventLink) {
        tip.event = eventLink.textContent.trim();
    } else {
        // Альтернативный поиск
        const eventText = card.querySelector('dt.text-xl.font-bold, h2, h3');
        if (eventText) {
            tip.event = eventText.textContent.trim().split('•').pop().trim();
        }
    }
    
    // 3. Прогноз
    const predictionElement = card.querySelector('dt.text-xl.font-bold');
    if (predictionElement) {
        tip.prediction = predictionElement.textContent.trim();
    }
    
    // 4. Коэффициент
    const oddsElement = card.querySelector('[data-odds], .odds, span[title*="odds"]');
    if (oddsElement) {
        tip.odds = oddsElement.getAttribute('data-odds') || 
                   oddsElement.getAttribute('title')?.replace('Advised odds', '').trim() || 
                   oddsElement.textContent.trim();
    }
    
    // 5. Результат
    const resultElement = card.querySelector('dl.bg-grey-light-3, .result, [class*="result"]');
    if (resultElement) {
        const resultText = resultElement.textContent.toLowerCase().trim();
        tip.result = resultText.includes('won') ? '✅' : 
                     resultText.includes('lost') ? '❌' : '➖';
    }
    
    // 6. Прибыль
    const profitElement = card.querySelector('profit, [class*="profit"], [class*="Profit"]');
    if (profitElement) {
        tip.profit = profitElement.textContent.trim();
        tip.profitClass = tip.profit.startsWith('-') ? 'profit-negative' : 
                         tip.profit.startsWith('+') ? 'profit-positive' : '';
    }
    
    // 7. Ставка
    const stakeElement = card.querySelector('stake, [class*="stake"], [class*="Stake"]');
    if (stakeElement) {
        tip.stake = stakeElement.textContent.replace('stake', '').trim();
    }
    
    return tip;
}

// Альтернативный парсер
function parseAnyTipElement(element) {
    const text = element.textContent;
    const tip = {};
    
    // Ищем паттерны в тексте
    if (text.includes('v') && text.includes('odds') || text.includes('stake')) {
        // Извлекаем название матча
        const match = text.match(/([A-Za-z\s]+v[A-Za-z\s]+)/i);
        if (match) tip.event = match[0].trim();
        
        // Извлекаем коэффициент
        const oddsMatch = text.match(/odds\s*([\d.]+)/i) || text.match(/(\d+\.\d+)/);
        if (oddsMatch) tip.odds = oddsMatch[1];
        
        // Прибыль
        const profitMatch = text.match(/[+-]£?\d+/);
        if (profitMatch) {
            tip.profit = profitMatch[0];
            tip.profitClass = tip.profit.startsWith('-') ? 'profit-negative' : 'profit-positive';
        }
        
        // Дата
        const dateMatch = text.match(/\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}/);
        if (dateMatch) tip.date = formatDate(dateMatch[0]);
    }
    
    return tip;
}

// Парсим всю страницу
function parseWholePage(doc) {
    const tips = [];
    
    // Ищем все элементы с данными
    const allText = doc.body.textContent;
    const lines = allText.split('\n').filter(line => line.trim().length > 0);
    
    lines.forEach(line => {
        if (line.includes('v') && (line.includes('won') || line.includes('lost'))) {
            const tip = {};
            
            // Простая логика парсинга
            tip.event = line.split('•')[0]?.trim() || line.trim();
            
            if (line.includes('won')) tip.result = '✅';
            if (line.includes('lost')) tip.result = '❌';
            
            const oddsMatch = line.match(/\d+\.\d+/);
            if (oddsMatch) tip.odds = oddsMatch[0];
            
            tips.push(tip);
        }
    });
    
    return tips;
}

// Форматируем дату
function formatDate(dateString) {
    if (!dateString) return '';
    
    // Пример: "19th December 2025 at 15:20" → "2025-12-19"
    const months = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    
    try {
        const match = dateString.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = months[match[2]] || '01';
            const year = match[3];
            return `${year}-${month}-${day}`;
        }
    } catch (e) {
        // Если не удалось распарсить, возвращаем как есть
    }
    
    return dateString;
}

// Обновление таблицы - ИСПРАВЛЕННАЯ
function updateTable() {
    const tbody = document.getElementById('table-body');
    
    if (!tbody) {
        console.error('❌ Не найден tbody с id="table-body"');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (parsedData.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Нет данных. Начните парсинг.</td></tr>';
        return;
    }
    
    console.log(`📋 Обновляем таблицу с ${parsedData.length} записями`);
    
    parsedData.forEach((item, index) => {
        const row = document.createElement('tr');
        
        // Проверяем, это реальные данные или демо
        const isRealData = item.event && !item.event.includes('Manchester United');
        
        row.innerHTML = `
            <td>${item.date || '—'}</td>
            <td>${item.event || '—'}</td>
            <td><strong>${item.prediction || '—'}</strong></td>
            <td>${item.odds || '—'}</td>
            <td>${item.result || '—'}</td>
            <td class="${item.profitClass || ''}">${item.profit || '—'}</td>
        `;
        
        if (!isRealData) {
            row.style.opacity = '0.6';
            row.title = 'Демо-данные';
        }
        
        tbody.appendChild(row);
    });
}

// Обновление статистики - ИСПРАВЛЕННАЯ
function updateStats() {
    const parseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Проверяем, реальные ли данные
    const isRealData = parsedData.length > 0 && 
                      parsedData.some(item => item.event && !item.event.includes('Manchester United'));
    
    const recordCount = document.getElementById('record-count');
    const parseTimeElement = document.getElementById('parse-time');
    
    if (recordCount) {
        recordCount.textContent = parsedData.length;
        if (!isRealData) {
            recordCount.style.color = '#ff9800';
            recordCount.title = 'Демо-данные (реальные не загружены)';
        }
    }
    
    if (parseTimeElement) {
        parseTimeElement.textContent = parseTime;
    }
}

// Включение кнопок экспорта
function enableExportButtons() {
    const buttons = ['export-btn', 'export-csv', 'export-json'];
    const hasData = parsedData.length > 0;
    
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !hasData;
        }
    });
}

// Экспорт в Excel
function exportToExcel() {
    if (parsedData.length === 0) {
        toastr.warning('Нет данных для экспорта', 'Внимание');
        return;
    }
    
    try {
        // Создаём рабочую книгу
        const ws = XLSX.utils.json_to_sheet(parsedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tipstrr Прогнозы");
        
        // Генерируем файл
        const fileName = `tipstrr_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        toastr.success('Excel файл скачивается', 'Успех!');
        
    } catch (error) {
        console.error('Ошибка экспорта в Excel:', error);
        toastr.error('Ошибка при создании Excel', 'Ошибка!');
    }
}

// Экспорт в CSV
function exportToCSV() {
    if (parsedData.length === 0) return;
    
    const headers = ['Дата', 'Событие', 'Прогноз', 'Коэффициент', 'Результат', 'Прибыль'];
    const csvContent = [
        headers.join(','),
        ...parsedData.map(row => [
            `"${(row.date || '').replace(/"/g, '""')}"`,
            `"${(row.event || '').replace(/"/g, '""')}"`,
            `"${(row.prediction || '').replace(/"/g, '""')}"`,
            row.odds || '',
            row.result || '',
            row.profit || ''
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'tipstrr_data.csv', 'text/csv');
}

// Экспорт в JSON
function exportToJSON() {
    if (parsedData.length === 0) return;
    
    const jsonContent = JSON.stringify(parsedData, null, 2);
    downloadFile(jsonContent, 'tipstrr_data.json', 'application/json');
}

// Общая функция скачивания файла
function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toastr.success(`Файл ${fileName} скачивается`, 'Успех!');
}

// Печать таблицы
function printTable() {
    window.print();
}

// Очистка данных
function clearData() {
    if (parsedData.length === 0) {
        toastr.info('Нет данных для очистки');
        return;
    }
    
    if (confirm('Очистить все данные?')) {
        parsedData = [];
        updateTable();
        updateStats();
        enableExportButtons();
        toastr.success('Данные очищены');
    }
}

// Сохранение данных
function saveData() {
    try {
        localStorage.setItem('tipstrrData', JSON.stringify({
            data: parsedData,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

// Показать/скрыть загрузку
function showLoading(show) {
    const loading = document.getElementById('loading');
    const parseBtn = document.getElementById('parse-btn');
    
    if (!loading || !parseBtn) return;
    
    if (show) {
        loading.style.display = 'block';
        parseBtn.disabled = true;
        parseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Идет парсинг...';
    } else {
        loading.style.display = 'none';
        parseBtn.disabled = false;
        parseBtn.innerHTML = '<i class="fas fa-play"></i> Начать парсинг';
    }
}

// Добавляем стили
const style = document.createElement('style');
style.textContent = `
    .profit-positive { color: #28a745; font-weight: bold; }
    .profit-negative { color: #dc3545; font-weight: bold; }
    
    #loading {
        background: rgba(255,255,255,0.9);
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        margin: 20px 0;
    }
    
    .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #4361ee;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 10px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .debug-info {
        background: #f8f9fa;
        padding: 10px;
        border-radius: 5px;
        margin: 10px 0;
        font-size: 12px;
        color: #666;
    }
`;
document.head.appendChild(style);

// Инициализация
console.log('🔥 Tipstrr Parser v2.0 готов к работе');
console.log('📌 Тестовый URL: https://tipstrr.com/tipster/freguli/results');
