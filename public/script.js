// Удали ВСЕ старые функции парсинга и оставь только это:

let parsedData = [];

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Парсер Tipstrr загружен (серверная версия)');
    document.getElementById('parse-btn').addEventListener('click', fetchDataFromServer);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
});

async function fetchDataFromServer() {
    showLoading(true);
    console.log('🚀 Запрашиваю данные с сервера...');
    
    try {
        const count = document.getElementById('count-select').value;
        const response = await fetch(`http://localhost:3000/api/tips?count=${count}`);
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.tips.length > 0) {
            // Преобразуем данные для таблицы
            parsedData = formatTipsForTable(result.tips);
            showResults();
            document.getElementById('export-btn').disabled = false;
            alert(`✅ Успех! Получено ${parsedData.length} реальных прогнозов с сервера.`);
        } else {
            alert('❌ Сервер не вернул данные. Проверь консоль сервера.');
        }
    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('Ошибка: ' + error.message);
        
        // На случай если сервер не запущен - демо данные
        if (error.message.includes('Failed to fetch')) {
            alert('⚠️ Сервер не отвечает. Запусти server.js!');
        }
    } finally {
        showLoading(false);
    }
}

function formatTipsForTable(tips) {
    return tips.map(tip => ({
        addedDate: tip.date || new Date().toISOString(),
        matchDateTime: tip.date || '',
        event: tip.event || 'Не указано',
        prediction: tip.prediction || 'Match winner',
        advisedOdds: tip.odds || '-',
        stake: tip.stake || '£10',
        result: tip.result === '✅' ? 'won' : (tip.result === '❌' ? 'lost' : 'pending'),
        profit: tip.profit || '-',
        league: tip.league || ''
    }));
}

// Остальные функции showResults, showLoading, exportToExcel оставь как есть
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (!parsedData.length) {
        tbody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
        countSpan.textContent = '0';
        return;
    }
    
    let html = '';
    parsedData.forEach(item => {
        html += `<tr>
            <td>${formatDate(item.addedDate)}</td>
            <td>${formatDate(item.matchDateTime)}</td>
            <td>${item.event || '-'}</td>
            <td>${item.prediction || '-'}</td>
            <td>${item.advisedOdds || '-'}</td>
            <td>${item.stake || '-'}</td>
            <td class="${item.result === 'won' ? 'success' : 'error'}">${item.result || '-'}</td>
            <td class="${(item.profit || '').startsWith('+') ? 'success' : 'error'}">${item.profit || '-'}</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
    countSpan.textContent = parsedData.length;
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    const btn = document.getElementById('parse-btn');
    
    if (show) {
        loading.style.display = 'block';
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Получаю с сервера...';
    } else {
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Парсить';
    }
}

function exportToExcel() {
    if (!parsedData.length) {
        alert('Нет данных для экспорта');
        return;
    }
    
    try {
        const ws = XLSX.utils.json_to_sheet(parsedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Прогнозы");
        XLSX.writeFile(wb, `tipstrr_${new Date().toISOString().slice(0,10)}.xlsx`);
        alert('Файл сохранен!');
    } catch (error) {
        alert('Ошибка экспорта: ' + error.message);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toISOString().split('T')[0];
    } catch {
        return dateStr;
    }
}

// Функции для отладки (оставь если нужны)
function testAPI() {
    fetch('http://localhost:3000/api/health')
        .then(res => res.json())
        .then(data => alert(`Статус сервера: ${data.status}\nВремя: ${data.timestamp}`))
        .catch(() => alert('Сервер не отвечает!'));
}

function simpleTest() {
    fetch('http://localhost:3000/api/stats')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(`📊 Статистика:\nВсего: ${data.stats.total}\nВыиграно: ${data.stats.won}\nПроиграно: ${data.stats.lost}\nПрибыль: £${data.stats.totalProfit}`);
            } else {
                alert('Ошибка: ' + data.error);
            }
        })
        .catch(() => alert('Сервер не запущен!'));
}

console.log('✅ Парсер готов. Запусти server.js и нажми "Парсить"!');
