let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('parse-btn').addEventListener('click', parseData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
});

// Парсинг данных
async function parseData() {
    const url = document.getElementById('url-input').value;
    const count = document.getElementById('count-select').value;
    
    showLoading(true);
    
    try {
        // Используем прокси для обхода CORS
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const html = data.contents;
        
        // Парсим HTML
        parsedData = parseHTML(html, count);
        
        // Показываем результаты
        showResults();
        
        // Включаем кнопку экспорта
        document.getElementById('export-btn').disabled = parsedData.length === 0;
        
    } catch (error) {
        alert('Ошибка: ' + error.message);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Парсинг HTML
function parseHTML(html, limit) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const data = [];
    
    // Ищем все карточки с прогнозами
    const cards = doc.querySelectorAll('article, [class*="card"], [data-island]');
    
    cards.forEach((card, index) => {
        if (index >= limit) return;
        
        const tip = {};
        
        // Дата
        const dateEl = card.querySelector('time');
        if (dateEl) tip.date = dateEl.getAttribute('title') || dateEl.textContent;
        
        // Матч
        const matchEl = card.querySelector('a[href*="/fixture/"]');
        if (matchEl) tip.event = matchEl.textContent;
        
        // Прогноз
        const predEl = card.querySelector('dt, h3, h4');
        if (predEl) tip.prediction = predEl.textContent;
        
        // Коэффициент
        const oddsEl = card.querySelector('[data-odds], .odds');
        if (oddsEl) tip.odds = oddsEl.getAttribute('data-odds') || oddsEl.textContent;
        
        // Результат
        const resultEl = card.querySelector('[class*="result"], [class*="status"]');
        if (resultEl) {
            const text = resultEl.textContent.toLowerCase();
            tip.result = text.includes('won') ? '✅' : text.includes('lost') ? '❌' : '➖';
        }
        
        // Прибыль
        const profitEl = card.querySelector('profit, [class*="profit"]');
        if (profitEl) tip.profit = profitEl.textContent;
        
        // Добавляем только если есть данные
        if (tip.event && tip.event !== 'Unlock this free football result') {
            data.push(tip);
        }
    });
    
    return data;
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
        html += `
            <tr>
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
}

// Экспорт в Excel
function exportToExcel() {
    if (parsedData.length === 0) return;
    
    try {
        const ws = XLSX.utils.json_to_sheet(parsedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Прогнозы");
        
        const fileName = `tipstrr_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        alert('Файл сохранен!');
        
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
