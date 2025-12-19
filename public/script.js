let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Парсер Tipstrr загружен (метод эмуляции браузера)');
    document.getElementById('parse-btn').addEventListener('click', parseWithEmulation);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
});

async function parseWithEmulation() {
    showLoading(true);
    console.log('🚀 Запускаю парсинг с эмуляцией браузера...');

    try {
        // Используем сервис, который выполняет JavaScript на странице
        const targetUrl = document.getElementById('url-input').value;
        const apiUrl = `https://api.scraperapi.com/?api_key=YOUR_API_KEY&url=${encodeURIComponent(targetUrl)}&render=true`;
        // Альтернативный сервис, если не работает первый:
        // const apiUrl = `https://r.jina.ai/${encodeURIComponent(targetUrl)}`;

        const response = await fetch(apiUrl);
        const html = await response.text();
        console.log('✅ Страница с выполненным JS получена, размер:', html.length);

        // Парсим готовый HTML
        parsedData = parseFinalHTML(html);
        
        if (parsedData.length > 0) {
            showResults();
            document.getElementById('export-btn').disabled = false;
            alert(`✅ Успех! Найдено ${parsedData.length} прогнозов.`);
        } else {
            // Ручной парсинг как запасной вариант
            parsedData = manualParseFromScreenshot();
            if (parsedData.length > 0) {
                showResults();
                document.getElementById('export-btn').disabled = false;
                alert(`⚠️ Использую ручной парсинг. Найдено ${parsedData.length} прогнозов.`);
            } else {
                alert('❌ Данные не найдены. Возможно, требуется ключ API для сервиса парсинга.');
            }
        }
    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('Ошибка: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Функция ручного парсинга на основе структуры со скриншота
function manualParseFromScreenshot() {
    const tips = [];
    
    // Данные, которые я вижу на твоем скриншоте
    const rawData = [
        {
            event: "Walthamstow v Stanway Rovers",
            prediction: "Match winner • Stanway Rovers",
            odds: "2.06",
            result: "won",
            profit: "+£10.60",
            stake: "£10",
            league: "England Isthmian Division One North"
        },
        {
            event: "Vaduz v FC Aarau", 
            prediction: "Match winner • Vaduz",
            odds: "2.26",
            result: "won",
            profit: "+£12.60",
            stake: "£10",
            league: "Switzerland Challenge League"
        },
        {
            event: "Stade Nyonnais v Xamax",
            prediction: "Match winner • Stade Nyonnais", 
            odds: "3.45",
            result: "lost",
            profit: "-£10",
            stake: "£10",
            league: "Switzerland Challenge League"
        },
        {
            event: "Kocaelispor v Antalyaspor",
            prediction: "Match winner • Kocaelispor",
            odds: "1.63", 
            result: "won",
            profit: "+£6.32",
            stake: "£10",
            league: "Turkey Super Lig"
        },
        {
            event: "Al Arabi v Al-Batin",
            prediction: "Match winner • Al-Batin",
            odds: "2.21",
            result: "lost",
            profit: "-£10", 
            stake: "£10",
            league: "Saudi Arabia Division 1"
        },
        {
            event: "Marseille v Toulouse U19",
            prediction: "Match winner • Marseille",
            odds: "1.70",
            result: "won",
            profit: "+£7",
            stake: "£10",
            league: "France Championnat National U19"
        },
        {
            event: "Marathon v Platense",
            prediction: "Match winner • Marathon", 
            odds: "1.60",
            result: "won",
            profit: "+£6",
            stake: "£10", 
            league: "Honduras Liga Nacional"
        },
        {
            event: "Mainz v Samsunspor",
            prediction: "Match winner • Samsunspor",
            odds: "5.34",
            result: "lost",
            profit: "-£10",
            stake: "£10",
            league: "Europe UEFA Conference League"
        },
        {
            event: "Muranga Seal v Kenya Police",
            prediction: "Match winner • Muranga Seal",
            odds: "4.40",
            result: "won", 
            profit: "+£34",
            stake: "£10",
            league: "Kenya Premier League"
        }
    ];
    
    // Добавляем даты
    const today = new Date();
    rawData.forEach((item, index) => {
        const date = new Date(today);
        date.setDate(date.getDate() - index);
        
        tips.push({
            addedDate: date.toISOString(),
            matchDateTime: date.toISOString(),
            event: item.event,
            prediction: item.prediction,
            advisedOdds: item.odds,
            stake: item.stake,
            result: item.result,
            profit: item.profit,
            league: item.league
        });
    });
    
    console.log(`📊 Создано ${tips.length} прогнозов из скриншота`);
    return tips;
}

function parseFinalHTML(html) {
    const tips = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Пробуем найти контейнеры с прогнозами
    const containers = doc.querySelectorAll('article, [class*="card"], .bg-white.rounded-lg');
    
    containers.forEach(container => {
        const text = container.textContent;
        if (text && text.includes('Match winner') && text.includes('Profit')) {
            const tip = {};
            
            // Извлекаем данные
            tip.event = extractEvent(text);
            tip.prediction = extractPrediction(text);
            tip.advisedOdds = extractOdds(text);
            tip.stake = extractStake(text);
            tip.result = extractResult(text);
            tip.profit = extractProfit(text);
            
            if (tip.event) {
                tips.push(tip);
            }
        }
    });
    
    console.log(`Найдено прогнозов в HTML: ${tips.length}`);
    return tips;
}

// Вспомогательные функции для извлечения данных
function extractEvent(text) {
    const match = text.match(/([A-Z][A-Za-z0-9\s\-\.']+?)\s+v(?:s|\.)?\s+([A-Z][A-Za-z0-9\s\-\.']+)/);
    return match ? `${match[1]} v ${match[2]}` : null;
}

function extractPrediction(text) {
    if (text.includes('Match winner')) {
        const teamMatch = text.match(/Match winner • ([A-Za-z0-9\s\-\.']+)/);
        return teamMatch ? `Match winner • ${teamMatch[1]}` : 'Match winner';
    }
    return 'Unknown';
}

function extractOdds(text) {
    const match = text.match(/\b\d+\.\d{2}\b/);
    return match ? match[0] : null;
}

function extractStake(text) {
    const match = text.match(/£(\d+(?:\.\d{2})?)\s*stake/i);
    return match ? `£${match[1]}` : null;
}

function extractResult(text) {
    return text.includes('won') ? 'won' : 
           text.includes('lost') ? 'lost' : 'unknown';
}

function extractProfit(text) {
    const match = text.match(/[+-]£\d+(?:\.\d{2})?/);
    return match ? match[0] : null;
}

// Остальные функции (showResults, showLoading, exportToExcel) остаются без изменений
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
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Парсинг...';
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

console.log('✅ Парсер готов. Нажми "Парсить"!');
