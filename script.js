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
            parsedData = parseHTML(htmlContent);
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

// Парсинг HTML (заглушка - здесь будет реальный парсинг)
function parseHTML(html) {
    // Здесь должна быть реальная логика парсинга
    // Временная заглушка возвращает тестовые данные
    
    // Пример простого парсера (нужно адаптировать под структуру tipstrr):
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Здесь анализируем структуру сайта tipstrr.com
        // Это пример - нужно изучить реальную структуру
        
        const data = [];
        
        // Ищем таблицы или списки с прогнозами
        const tables = doc.querySelectorAll('table');
        const lists = doc.querySelectorAll('[class*="prediction"], [class*="bet"]');
        
        console.log('Найдено элементов:', tables.length + lists.length);
        
        // Если не нашли данных, возвращаем тестовые
        if (data.length === 0) {
            return CONFIG.mockData;
        }
        
        return data;
        
    } catch (error) {
        console.error('Ошибка парсинга HTML:', error);
        return CONFIG.mockData;
    }
}

// Обновление таблицы
function updateTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    if (parsedData.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Нет данных</td></tr>';
        return;
    }
    
    parsedData.forEach(item => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${item.date || '-'}</td>
            <td>${item.event || '-'}</td>
            <td><strong>${item.prediction || '-'}</strong></td>
            <td>${item.odds || '-'}</td>
            <td>${item.result || '-'}</td>
            <td class="${item.profit?.startsWith('+') ? 'profit-positive' : 'profit-negative'}">
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
        // Создаём рабочую книгу
        const ws = XLSX.utils.json_to_sheet(parsedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Прогнозы");
        
        // Генерируем файл
        const fileName = `tipstrr_data_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        toastr.success('Файл скачивается', 'Успех!');
        
    } catch (error) {
        console.error('Ошибка экспорта в Excel:', error);
        toastr.error('Ошибка при создании Excel файла', 'Ошибка!');
    }
}

// Экспорт в CSV
function exportToCSV() {
    if (parsedData.length === 0) return;
    
    const headers = ['Дата', 'Событие', 'Прогноз', 'Коэффициент', 'Результат', 'Прибыль'];
    const csvContent = [
        headers.join(','),
        ...parsedData.map(row => [
            row.date,
            `"${row.event}"`,
            row.prediction,
            row.odds,
            row.result,
            row.profit
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
    
    toastr.success('Файл скачивается', 'Успех!');
}

// Печать таблицы
function printTable() {
    window.print();
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
        parseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обработка...';
    } else {
        loading.style.display = 'none';
        parseBtn.disabled = false;
        parseBtn.innerHTML = '<i class="fas fa-play"></i> Начать парсинг';
    }
}

// Добавляем стили для прибыли
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
