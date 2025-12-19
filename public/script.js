let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('Парсер загружен');
    document.getElementById('parse-btn').addEventListener('click', parseData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
    
    // Тестовая функция
    window.testParse = testParse;
});

// Парсинг данных - ПРЯМОЕ ПОЛУЧЕНИЕ JSON
async function parseData() {
    showLoading(true);
    
    try {
        console.log('Получаю JSON данные...');
        
        // Прямой URL к данным tipster'а
        const tipsterId = 'freguli';
        const jsonUrl = `https://tipstrr.com/api/tipster/${tipsterId}/results/data`;
        
        // Используем прокси
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(jsonUrl)}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            // Пробуем альтернативный URL
            return await parseAlternative();
        }
        
        const jsonData = await response.json();
        console.log('JSON получен:', jsonData);
        
        // Парсим данные
        parsedData = parseTipstrrJson(jsonData);
        
        // Если не получилось, пробуем другой метод
        if (parsedData.length === 0) {
            parsedData = await parseFromApi();
        }
        
        // Показываем результаты
        showResults();
        
        // Включаем кнопку экспорта
        document.getElementById('export-btn').disabled = parsedData.length === 0;
        
        console.log(`Найдено ${parsedData.length} записей`);
        
        if (parsedData.length === 0) {
            alert('Данные не найдены. Использую демо-данные.');
            loadDemoData();
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка получения данных. Проверьте консоль (F12).');
        
        // Показываем демо-данные
        loadDemoData();
    } finally {
        showLoading(false);
    }
}

// Альтернативный метод парсинга
async function parseAlternative() {
    console.log('Пробую альтернативный метод...');
    
    const url = 'https://tipstrr.com/tipster/freguli/results';
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    const html = await response.text();
    
    // Извлекаем данные из HTML
    const data = extractDataFromHtml(html);
    return data;
}

// Извлечение данных из HTML (из вашего примера)
function extractDataFromHtml(html) {
    const data = [];
    
    try {
        // Ищем JSON в скриптах
        const scriptRegex = /<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i;
        const match = html.match(scriptRegex);
        
        if (match && match[1]) {
            console.log('Найден INITIAL_STATE');
            const jsonStr = match[1];
            const jsonData = JSON.parse(jsonStr);
            
            // Парсим данные
            if (jsonData.PORTFOLIO_TIP_CACHED) {
                const tips = jsonData.PORTFOLIO_TIP_CACHED;
                
                for (const key in tips) {
                    const tip = tips[key];
                    const parsed = parseTipData(tip);
                    if (parsed) data.push(parsed);
                }
            }
        }
        
        // Если не нашли, ищем в другом месте
        if (data.length === 0) {
            const jsonRegex = /"PORTFOLIO_TIP_CACHED"\s*:\s*({[^}]+})/g;
            const matches = html.match(jsonRegex);
            
            if (matches) {
                matches.forEach(match => {
                    try {
                        const jsonStr = '{' + match + '}';
                        const jsonData = JSON.parse(jsonStr);
                        
                        if (jsonData.PORTFOLIO_TIP_CACHED) {
                            const tips = jsonData.PORTFOLIO_TIP_CACHED;
                            for (const key in tips) {
                                const tip = tips[key];
                                const parsed = parseTipData(tip);
                                if (parsed) data.push(parsed);
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки парсинга
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('Ошибка извлечения из HTML:', error);
    }
    
    return data;
}

// Парсинг данных из JSON
function parseTipstrrJson(jsonData) {
    const data = [];
    
    try {
        // Проверяем различные структуры данных
        if (Array.isArray(jsonData)) {
            // Если это массив прогнозов
            jsonData.forEach(tip => {
                const parsed = parseTipData(tip);
                if (parsed) data.push(parsed);
            });
        } else if (jsonData.tips || jsonData.results) {
            // Если есть ключи tips или results
            const tips = jsonData.tips || jsonData.results || [];
            tips.forEach(tip => {
                const parsed = parseTipData(tip);
                if (parsed) data.push(parsed);
            });
        } else if (jsonData.data) {
            // Если данные в data
            const tips = jsonData.data.tips || jsonData.data.results || [];
            tips.forEach(tip => {
                const parsed = parseTipData(tip);
                if (parsed) data.push(parsed);
            });
        }
        
    } catch (error) {
        console.error('Ошибка парсинга JSON:', error);
    }
    
    return data;
}

// Парсинг одного прогноза
function parseTipData(tip) {
    try {
        const result = {};
        
        // Дата
        if (tip.tipDate || tip.date) {
            const dateStr = tip.tipDate || tip.date;
            const date = new Date(dateStr);
            result.date = date.toISOString().split('T')[0];
        }
        
        // Название
        result.event = tip.title || tip.name || '';
        
        // Прогноз
        if (tip.tipBetItem && tip.tipBetItem.length > 0) {
            const bet = tip.tipBetItem[0];
            result.prediction = `${bet.marketText || 'Match winner'} • ${bet.betText || ''}`;
            result.odds = bet.finalOdds || bet.createdOdds || '';
        } else if (tip.betType) {
            result.prediction = tip.marketText || 'Match winner';
            result.odds = tip.odds || '';
        }
        
        // Результат
        if (tip.result === 1 || tip.status === 'won') {
            result.result = '✅';
        } else if (tip.result === 3 || tip.status === 'lost') {
            result.result = '❌';
        } else {
            result.result = '➖';
        }
        
        // Прибыль
        if (tip.profit !== undefined) {
            if (tip.profit > 0) {
                result.profit = `+£${tip.profit.toFixed(2)}`;
            } else if (tip.profit < 0) {
                result.profit = `-£${Math.abs(tip.profit).toFixed(2)}`;
            } else {
                result.profit = '£0.00';
            }
        }
        
        // Ставка
        if (tip.totalStake || tip.stake) {
            const stake = tip.totalStake || tip.stake;
            result.stake = `£${stake}`;
        }
        
        return result.event ? result : null;
        
    } catch (error) {
        console.error('Ошибка парсинга прогноза:', error);
        return null;
    }
}

// Парсинг через публичный API
async function parseFromApi() {
    console.log('Пробую публичный API...');
    
    try {
        // Публичный API endpoint
        const apiUrl = 'https://api.tipstrr.com/v1/tipster/freguli/tips?limit=50';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('API не доступен');
        }
        
        const jsonData = await response.json();
        return parseTipstrrJson(jsonData);
        
    } catch (error) {
        console.error('API ошибка:', error);
        return [];
    }
}

// Загрузка демо-данных
function loadDemoData() {
    parsedData = [
        {
            date: '2025-12-19',
            event: 'Al Arabi v Al-Batin',
            prediction: 'Match winner • Al-Batin',
            odds: '2.21',
            result: '❌',
            profit: '-£1.00',
            stake: '£1'
        },
        {
            date: '2025-12-19',
            event: 'Kocaelispor v Antalyaspor',
            prediction: 'Match winner • Kocaelispor',
            odds: '1.63',
            result: '✅',
            profit: '+£0.63',
            stake: '£1'
        },
        {
            date: '2025-12-19',
            event: 'Marseille v Toulouse U19',
            prediction: 'Match winner • Marseille',
            odds: '1.70',
            result: '✅',
            profit: '+£0.70',
            stake: '£1'
        },
        {
            date: '2025-12-18',
            event: 'Mainz v Samsunspor',
            prediction: 'Match winner • Samsunspor',
            odds: '3.50',
            result: '❌',
            profit: '-£1.00',
            stake: '£1'
        }
    ];
    
    showResults();
    document.getElementById('export-btn').disabled = false;
}

// Показать результаты
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (!tbody) {
        console.error('Не найден tbody');
        return;
    }
    
    if (parsedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Нет данных</td></tr>';
        if (countSpan) countSpan.textContent = '0';
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
    if (countSpan) countSpan.textContent = parsedData.length;
}

// Экспорт в Excel
function exportToExcel() {
    if (parsedData.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }
    
    try {
        const exportData = parsedData.map(item => ({
            'Дата': item.date || '',
            'Матч': item.event || '',
            'Прогноз': item.prediction || '',
            'Коэффициент': item.odds || '',
            'Результат': item.result || '',
            'Прибыль': item.profit || '',
            'Ставка': item.stake || ''
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
    
    if (!loading || !btn) return;
    
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

// Тестовая функция для отладки
async function testParse() {
    console.log('=== ТЕСТ ПАРСЕРА ===');
    
    // Тест 1: Прямой запрос
    console.log('Тест 1: Прямой запрос к Tipstrr...');
    
    try {
        const testUrl = 'https://tipstrr.com/tipster/freguli';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(testUrl)}`;
        
        const response = await fetch(proxyUrl);
        const html = await response.text();
        
        console.log('HTML получен, размер:', html.length, 'символов');
        
        // Ищем JSON
        const jsonMatch = html.match(/"PORTFOLIO_TIP_CACHED"[^{]+\{[\s\S]+?\}\s*\}/);
        if (jsonMatch) {
            console.log('JSON найден в HTML');
            console.log('Длина JSON:', jsonMatch[0].length);
            
            // Пробуем извлечь данные
            const data = extractDataFromHtml(html);
            console.log('Извлечено записей:', data.length);
            
            if (data.length > 0) {
                console.log('Первая запись:', data[0]);
                parsedData = data;
                showResults();
                return true;
            }
        }
        
        // Ищем в скриптах
        const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
        if (scriptTags) {
            console.log('Найдено скриптов:', scriptTags.length);
            
            for (let i = 0; i < scriptTags.length; i++) {
                if (scriptTags[i].includes('PORTFOLIO_TIP_CACHED')) {
                    console.log('Найден скрипт с данными:', i);
                    break;
                }
            }
        }
        
    } catch (error) {
        console.error('Тест 1 ошибка:', error);
    }
    
    // Тест 2: Демо-данные
    console.log('Тест 2: Загружаю демо-данные');
    loadDemoData();
    
    return false;
}

// Авто-тест при загрузке
setTimeout(() => {
    console.log('Парсер готов. Нажмите "Парсить" или вызовите testParse() в консоли.');
}, 1000);
