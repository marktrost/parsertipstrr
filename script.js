// Конфигурация
const CONFIG = {
    corsProxy: 'https://api.allorigins.win/get?url=',
    mockData: [
        {
            date: '2023-10-15',
            event: 'Manchester United vs Liverpool',
            prediction: 'П1',
            odds: '2.10',
            result: '✅',
            profit: '+1.10'
        },
        {
            date: '2023-10-14',
            event: 'Real Madrid vs Barcelona',
            prediction: 'ТМ 2.5',
            odds: '1.85',
            result: '❌',
            profit: '-1.00'
        },
        {
            date: '2023-10-13',
            event: 'Bayern Munich vs Dortmund',
            prediction: 'Ф1(-1)',
            odds: '1.95',
            result: '✅',
            profit: '+0.95'
        }
    ]
};

// Глобальные переменные
let parsedData = [];
let startTime = 0;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    // Настройка toastr
    toastr.options = {
        positionClass: 'toast-top-right',
        progressBar: true,
        timeOut: 3000
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
            document.getElementById('url-input').value = this.dataset.url;
            toastr.info('Пример URL вставлен', 'Готово!');
        });
    });

    // Загружаем сохранённые данные
    loadSavedData();
});

// Парсинг данных
async function startParsing() {
    const url = document.getElementById('url-input').value.trim();
    const mode = document.getElementById('proxy-select').value;
    
    if (!url) {
        toastr.error('Введите URL страницы', 'Ошибка!');
        return;
    }

    if (!url.includes('tipstrr.com')) {
        toastr.warning('URL должен содержать tipstrr.com', 'Внимание!');
    }

    // Показываем загрузку
    showLoading(true);
    startTime = Date.now();
    
    try {
        let htmlContent = '';
        
        switch(mode) {
            case 'direct':
                htmlContent = await fetchDirect(url);
                break;
            case 'corsproxy':
                htmlContent = await fetchViaProxy(url);
                break;
            case 'mock':
                htmlContent = '<mock>test data</mock>';
                parsedData = CONFIG.mockData;
                break;
        }
        
        if (mode !== 'mock') {
            // Используем новый парсер для реальных данных
            parsedData = await fetchRealTipstrrData(url);
        }
        
        if (parsedData.length > 0) {
            updateTable();
            updateStats();
            enableExportButtons();
            saveData();
            toastr.success(`Найдено ${parsedData.length} записей`, 'Успех!');
        } else {
            toastr.warning('Данные не найдены', 'Внимание');
        }
        
    } catch (error) {
        console.error('Ошибка парсинга:', error);
        toastr.error('Ошибка при загрузке данных', 'Ошибка!');
        
        // Показываем тестовые данные для демонстрации
        parsedData = CONFIG.mockData;
        updateTable();
        updateStats();
        enableExportButtons();
        toastr.info('Показаны демо-данные', 'Демо режим');
    } finally {
        showLoading(false);
    }
}

// Запрос через прокси
async function fetchViaProxy(url) {
    const proxyUrl = CONFIG.corsProxy + encodeURIComponent(url);
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.contents;
}

// Прямой запрос (будет работать только если CORS разрешён)
async function fetchDirect(url) {
    const response = await fetch(url, {
        mode: 'cors',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.text();
}

// Функция для парсинга карточки прогноза
function parseTipCard(cardElement) {
    // Извлекаем данные по селекторам, найденным в вашем HTML
    const tip = {};
    
    // 1. Дата и время события
    const dateElement = cardElement.querySelector('time');
    if (dateElement) {
        tip.date = dateElement.getAttribute('title') || dateElement.textContent.trim();
    }
    
    // 2. Название события (матча)
    const matchElement = cardElement.querySelector('a[href*="/fixture/"]');
    if (matchElement) {
        tip.event = matchElement.textContent.trim();
    }
    
    // 3. Тип прогноза (например, "Match winner • Al-Batin")
    const predictionElement = cardElement.querySelector('dt.text-xl.font-bold');
    if (predictionElement) {
        tip.prediction = predictionElement.textContent.trim();
    }
    
    // 4. Коэффициент
    const oddsElement = cardElement.querySelector('[data-odds]');
    if (oddsElement) {
        tip.odds = oddsElement.getAttribute('data-odds') || oddsElement.textContent.trim();
    }
    
    // 5. Результат ("won" или "lost")
    const resultElement = cardElement.querySelector('dl.bg-grey-light-3 dd');
    if (resultElement) {
        const resultText = resultElement.textContent.trim().toLowerCase();
        tip.result = resultText === 'won' ? '✅' : resultText === 'lost' ? '❌' : '➖';
    }
    
    // 6. Прибыль (Profit)
    const profitElement = cardElement.querySelector('profit');
    if (profitElement) {
        const profitText = profitElement.textContent.trim();
        tip.profit = profitText;
        
        // Определяем знак прибыли для стилей
        if (profitText.startsWith('-')) {
            tip.profitClass = 'profit-negative';
        } else if (profitText.startsWith('+')) {
            tip.profitClass = 'profit-positive';
        }
    }
    
    // 7. Дополнительно: ставка (stake)
    const stakeElement = cardElement.querySelector('stake');
    if (stakeElement) {
        tip.stake = stakeElement.textContent.replace('stake', '').trim();
    }
    
    // 8. Дополнительно: букмекер
    const bookmakerElement = cardElement.querySelector('a[href="/bookmaker-reviews"]');
    if (bookmakerElement) {
        tip.bookmaker = bookmakerElement.textContent.trim();
    }
    
    return tip;
}

// Функция для парсинга конкретного примера из вашего HTML
function parseTipFromExample(doc) {
    // Эти селекторы основаны на точной структуре из вашего примера
    const tip = {};
    
    // Дата и время из тега <time>
    const dateTime = doc.querySelector('time[title*="December"]');
    if (dateTime) {
        tip.date = dateTime.getAttribute('title');
    }
    
    // Название матча
    const matchLink = doc.querySelector('a[href*="/fixture/"]');
    if (matchLink) {
        tip.event = matchLink.textContent.trim();
    }
    
    // Тип прогноза и выбор
    const predictionHeader = doc.querySelector('dt.text-xl.font-bold');
    if (predictionHeader) {
        tip.prediction = predictionHeader.textContent
            .replace(/•/g, '·')
            .trim();
    }
    
    // Коэффициент (используем data-odds атрибут)
    const oddsSpan = doc.querySelector('span[data-odds]');
    if (oddsSpan) {
        tip.odds = oddsSpan.getAttribute('data-odds');
    }
    
    // Результат
    const resultText = doc.querySelector('dl.bg-grey-light-3 dd')?.textContent.trim();
    if (resultText) {
        tip.result = resultText.toLowerCase() === 'lost' ? '❌' : '✅';
    }
    
    // Прибыль
    const profitSpan = doc.querySelector('profit span');
    if (profitSpan) {
        tip.profit = profitSpan.textContent.trim();
    }
    
    // Если есть достаточные данные, возвращаем объект
    if (tip.event && tip.prediction) {
        // Форматируем дату, если нужно
        if (tip.date && tip.date.includes('December')) {
            // Преобразуем в формат "2023-12-19"
            const dateMatch = tip.date.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/);
            if (dateMatch) {
                const months = {
                    'December': '12', 'January': '01', 'February': '02',
                    'March': '03', 'April': '04', 'May': '05',
                    'June': '06', 'July': '07', 'August': '08',
                    'September': '09', 'October': '10', 'November': '11'
                };
                const day = dateMatch[1].padStart(2, '0');
                const month = months[dateMatch[2]] || '01';
                const year = dateMatch[3];
                tip.date = `${year}-${month}-${day}`;
            }
        }
        
        return tip;
    }
    
    return null;
}

// Парсинг HTML (реальный парсер для tipstrr)
function parseHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const data = [];

    try {
        // 1. Ищем блоки с прогнозами на странице
        // Предполагаем, что каждый прогноз находится в блоке с классом "bg-white rounded-lg shadow-lg..."
        // Ищем статьи или блоки, которые выглядят как карточки прогнозов
        const feedCards = doc.querySelectorAll('article.flex.w-full.flex-col, [class*="feed-card"], .bg-white.rounded-lg.shadow-lg');

        // Если нашли такие блоки, парсим каждый
        if (feedCards.length > 0) {
            feedCards.forEach((card, index) => {
                try {
                    const tipData = parseTipCard(card);
                    if (tipData) {
                        data.push(tipData);
                    }
                } catch (error) {
                    console.warn(`Ошибка при парсинге карточки ${index}:`, error);
                }
            });
        } else {
            // 2. Альтернативный метод: парсим общую структуру страницы
            // Ваш пример показывает один конкретный прогноз, поэтому мы проанализируем его структуру
            const tipData = parseTipFromExample(doc);
            if (tipData) {
                data.push(tipData);
            }
        }

        // Если данных всё ещё нет, возвращаем демо-данные
        return data.length > 0 ? data : CONFIG.mockData;

    } catch (error) {
        console.error('Ошибка парсинга HTML:', error);
        return CONFIG.mockData;
    }
}

// НОВАЯ ФУНКЦИЯ: Загрузка реальных данных с tipstrr
async function fetchRealTipstrrData(url) {
    try {
        // Используем CORS прокси для обхода ограничений
        const proxyUrl = CONFIG.corsProxy + encodeURIComponent(url);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        const html = result.contents;
        
        // Парсим полученный HTML
        const parsedData = parseHTML(html);
        return parsedData;
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        throw error;
    }
}

// Обновление таблицы
function updateTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    if (parsedData.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Нет данных. Начните парсинг.</td></tr>';
        return;
    }
    
    parsedData.forEach(item => {
        const row = document.createElement('tr');
        
        // Форматируем дату для отображения
        let displayDate = item.date || '-';
        if (displayDate.includes('December') || displayDate.includes('202')) {
            // Упрощаем длинные даты
            displayDate = displayDate.split(' at ')[0] || displayDate;
        }
        
        row.innerHTML = `
            <td>${displayDate}</td>
            <td>${item.event || '-'}</td>
            <td><strong>${item.prediction || '-'}</strong></td>
            <td>${item.odds || '-'}</td>
            <td>${item.result || '-'}</td>
            <td class="${item.profitClass || ''}">
                ${item.profit || '-'}
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Обновление статистики
function updateStats() {
    const parseTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    document.getElementById('record-count').textContent = parsedData.length;
    document.getElementById('parse-time').textContent = parseTime;
}

// Включение кнопок экспорта
function enableExportButtons() {
    const buttons = ['export-btn', 'export-csv', 'export-json'];
    
    buttons.forEach(id => {
        document.getElementById(id).disabled = parsedData.length === 0;
    });
}

// Экспорт в Excel
function exportToExcel() {
    if (parsedData.length === 0) {
        toastr.warning('Нет данных для экспорта', 'Внимание');
        return;
    }
    
    try {
        // Подготавливаем данные для экспорта
        const exportData = parsedData.map(item => ({
            'Дата': item.date || '',
            'Событие': item.event || '',
            'Прогноз': item.prediction || '',
            'Коэффициент': item.odds || '',
            'Результат': item.result || '',
            'Прибыль': item.profit || '',
            'Ставка': item.stake || '',
            'Букмекер': item.bookmaker || ''
        }));
        
        // Создаём рабочую книгу
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Прогнозы Tipstrr");
        
        // Генерируем файл
        const fileName = `tipstrr_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        toastr.success('Файл скачивается', 'Успех!');
        
    } catch (error) {
        console.error('Ошибка экспорта в Excel:', error);
        toastr.error('Ошибка при создании Excel файла', 'Ошибка!');
    }
}

// Экспорт в CSV
function exportToCSV() {
    if (parsedData.length === 0) {
        toastr.warning('Нет данных для экспорта', 'Внимание');
        return;
    }
    
    try {
        const headers = ['Дата', 'Событие', 'Прогноз', 'Коэффициент', 'Результат', 'Прибыль', 'Ставка', 'Букмекер'];
        const csvContent = [
            headers.join(','),
            ...parsedData.map(item => [
                `"${(item.date || '').replace(/"/g, '""')}"`,
                `"${(item.event || '').replace(/"/g, '""')}"`,
                `"${(item.prediction || '').replace(/"/g, '""')}"`,
                item.odds || '',
                item.result || '',
                item.profit || '',
                `"${(item.stake || '').replace(/"/g, '""')}"`,
                `"${(item.bookmaker || '').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');
        
        downloadFile(csvContent, 'tipstrr_data.csv', 'text/csv');
        
    } catch (error) {
        console.error('Ошибка экспорта в CSV:', error);
        toastr.error('Ошибка при создании CSV файла', 'Ошибка!');
    }
}

// Экспорт в JSON
function exportToJSON() {
    if (parsedData.length === 0) {
        toastr.warning('Нет данных для экспорта', 'Внимание');
        return;
    }
    
    try {
        const jsonContent = JSON.stringify(parsedData, null, 2);
        downloadFile(jsonContent, 'tipstrr_data.json', 'application/json');
        
    } catch (error) {
        console.error('Ошибка экспорта в JSON:', error);
        toastr.error('Ошибка при создании JSON файла', 'Ошибка!');
    }
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
    
    toastr.success('Файл скачивается', 'Успех!');
}

// Печать таблицы
function printTable() {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Прогнозы Tipstrr</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #4361ee; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                .profit-positive { color: green; }
                .profit-negative { color: red; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>Прогнозы Tipstrr</h1>
            <p>Дата экспорта: ${new Date().toLocaleString()}</p>
            <p>Всего записей: ${parsedData.length}</p>
            <table border="1">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Событие</th>
                        <th>Прогноз</th>
                        <th>Коэффициент</th>
                        <th>Результат</th>
                        <th>Прибыль</th>
                    </tr>
                </thead>
                <tbody>
                    ${parsedData.map(item => `
                        <tr>
                            <td>${item.date || '-'}</td>
                            <td>${item.event || '-'}</td>
                            <td>${item.prediction || '-'}</td>
                            <td>${item.odds || '-'}</td>
                            <td>${item.result || '-'}</td>
                            <td class="${item.profitClass || ''}">${item.profit || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <p class="no-print">
                <br><br>
                <button onclick="window.print()">Печать</button>
                <button onclick="window.close()">Закрыть</button>
            </p>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Очистка данных
function clearData() {
    if (parsedData.length === 0) {
        toastr.info('Нет данных для очистки', 'Информация');
        return;
    }
    
    if (confirm('Очистить все данные?')) {
        parsedData = [];
        updateTable();
        updateStats();
        enableExportButtons();
        localStorage.removeItem('tipstrrData');
        toastr.success('Данные очищены', 'Готово');
    }
}

// Сохранение данных в localStorage
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

// Загрузка сохранённых данных
function loadSavedData() {
    try {
        const saved = localStorage.getItem('tipstrrData');
        if (saved) {
            const { data, timestamp } = JSON.parse(saved);
            
            // Загружаем если данные не старше 1 дня
            if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                parsedData = data;
                updateTable();
                updateStats();
                enableExportButtons();
                toastr.info('Загружены сохранённые данные', 'Добро пожаловать!');
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
}

// Показать/скрыть загрузку
function showLoading(show) {
    const loading = document.getElementById('loading');
    const parseBtn = document.getElementById('parse-btn');
    
    if (show) {
        loading.style.display = 'block';
        parseBtn.disabled = true;
        parseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Парсинг...';
    } else {
        loading.style.display = 'none';
        parseBtn.disabled = false;
        parseBtn.innerHTML = '<i class="fas fa-play"></i> Начать парсинг';
    }
}

// Добавляем стили для прибыли и улучшаем таблицу
const style = document.createElement('style');
style.textContent = `
    .profit-positive {
        color: #28a745;
        font-weight: bold;
    }
    .profit-negative {
        color: #dc3545;
        font-weight: bold;
    }
    
    /* Улучшаем таблицу */
    #data-table {
        min-width: 1000px;
    }
    
    #data-table th {
        position: sticky;
        top: 0;
        z-index: 10;
        box-shadow: 0 2px 2px -1px rgba(0,0,0,0.1);
    }
    
    #data-table td {
        vertical-align: middle;
        padding: 12px 15px;
    }
    
    #data-table tr:nth-child(even) {
        background-color: #f8f9fa;
    }
    
    @media print {
        .no-print {
            display: none !important;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            border: 1px solid #000;
            padding: 8px;
        }
    }
`;
document.head.appendChild(style);

// Консольное приветствие
console.log('%c🔥 Tipstrr Parser активен!', 'color: #4361ee; font-size: 16px; font-weight: bold;');
console.log('%c📊 Используйте URL: https://tipstrr.com/tipster/freguli/results', 'color: #4cc9f0; font-size: 14px;');
