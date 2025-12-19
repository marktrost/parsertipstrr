let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('Парсер загружен');
    document.getElementById('parse-btn').addEventListener('click', parseData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
    
    // Включаем кнопку теста для отладки
    window.testParse = testParse;
});

// Парсинг данных
async function parseData() {
    const url = document.getElementById('url-input').value;
    const count = parseInt(document.getElementById('count-select').value);
    
    showLoading(true);
    
    try {
        console.log('Загружаю страницу...');
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        
        const html = await response.text();
        console.log('HTML загружен, размер:', html.length, 'символов');
        
        parsedData = extractAndParseData(html, count);
        
        showResults();
        document.getElementById('export-btn').disabled = parsedData.length === 0;
        
        console.log(`Найдено записей: ${parsedData.length}`);
        
        if (parsedData.length === 0) {
            alert('На странице не найдено данных о прогнозах. Показаны демо-данные.');
            loadDemoData();
        } else {
            alert(`Успешно! Распарсено ${parsedData.length} прогнозов.`);
        }
        
    } catch (error) {
        console.error('Критическая ошибка:', error);
        alert('Не удалось загрузить страницу. Проверьте URL, интернет или попробуйте позже.\n' + error.message);
        loadDemoData();
    } finally {
        showLoading(false);
    }
}

// Извлечение и парсинг данных из HTML
function extractAndParseData(html, limit) {
    const data = [];
    
    try {
        // Ищем скрипт с INITIAL_STATE
        const scriptRegex = /<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i;
        const match = html.match(scriptRegex);
        
        if (match && match[1]) {
            console.log('Найден скрипт с INITIAL_STATE');
            
            let jsonStr = match[1];
            let openBraces = 0;
            let endIndex = 0;
            
            // Находим конец JSON объекта
            for (let i = 0; i < jsonStr.length; i++) {
                if (jsonStr[i] === '{') openBraces++;
                if (jsonStr[i] === '}') openBraces--;
                if (openBraces === 0) {
                    endIndex = i + 1;
                    break;
                }
            }
            
            jsonStr = jsonStr.substring(0, endIndex);
            
            try {
                const initialState = JSON.parse(jsonStr);
                
                // Ищем данные в PORTFOLIO_TIP_CACHED
                if (initialState.PORTFOLIO_TIP_CACHED) {
                    console.log('Обнаружен PORTFOLIO_TIP_CACHED');
                    const tipsCache = initialState.PORTFOLIO_TIP_CACHED;
                    let processed = 0;
                    
                    for (const key in tipsCache) {
                        if (processed >= limit) break;
                        
                        const tip = tipsCache[key];
                        const parsedTip = parseSingleTip(tip);
                        
                        if (parsedTip && parsedTip.event) {
                            data.push(parsedTip);
                            processed++;
                        }
                    }
                    console.log(`Обработано из кеша: ${data.length}`);
                }
                
                // Добираем из PORTFOLIO_COMPLETED_TIPS
                if (data.length < limit && initialState.PORTFOLIO_COMPLETED_TIPS) {
                    console.log('Добираем из PORTFOLIO_COMPLETED_TIPS');
                    const completed = initialState.PORTFOLIO_COMPLETED_TIPS;
                    
                    for (const portfolioKey in completed) {
                        const tipsArray = completed[portfolioKey];
                        
                        for (const shortTip of tipsArray) {
                            if (data.length >= limit) break;
                            
                            const cacheKey = `${shortTip.portfolioReference}_${shortTip.reference}`;
                            if (initialState.PORTFOLIO_TIP_CACHED && initialState.PORTFOLIO_TIP_CACHED[cacheKey]) {
                                const fullTip = initialState.PORTFOLIO_TIP_CACHED[cacheKey];
                                const parsedTip = parseSingleTip(fullTip);
                                if (parsedTip) data.push(parsedTip);
                            }
                        }
                    }
                }
                
            } catch (jsonError) {
                console.error('Ошибка парсинга JSON из скрипта:', jsonError);
            }
        } else {
            console.log('Скрипт с INITIAL_STATE не найден, пробую альтернативный поиск');
        }
        
    } catch (error) {
        console.error('Ошибка в extractAndParseData:', error);
    }
    
    return data;
}

// Парсинг одного прогноза
function parseSingleTip(tipObj) {
    try {
        const tip = {};
        
        // Дата
        if (tipObj.tipDate) {
            const date = new Date(tipObj.tipDate);
            tip.date = date.toISOString().split('T')[0];
        } else if (tipObj.dateAdded) {
            const date = new Date(tipObj.dateAdded);
            tip.date = date.toISOString().split('T')[0];
        }
        
        // Название матча
        tip.event = tipObj.title || 'Неизвестный матч';
        
        // Прогноз и коэффициент
        if (tipObj.tipBetItem && tipObj.tipBetItem.length > 0) {
            const betItem = tipObj.tipBetItem[0];
            tip.prediction = `${betItem.marketText || 'Прогноз'} • ${betItem.betText || ''}`;
            tip.odds = betItem.finalOdds || betItem.createdOdds || '';
        } else {
            tip.prediction = 'Данные о прогнозе отсутствуют';
            tip.odds = '';
        }
        
        // Результат
        if (tipObj.result === 1) {
            tip.result = '✅';
        } else if (tipObj.result === 3) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        // Прибыль
        if (tipObj.profit !== undefined && tipObj.profit !== null) {
            if (tipObj.profit > 0) {
                tip.profit = `+£${tipObj.profit.toFixed(2)}`;
            } else if (tipObj.profit < 0) {
                tip.profit = `-£${Math.abs(tipObj.profit).toFixed(2)}`;
            } else {
                tip.profit = '£0.00';
            }
        } else {
            tip.profit = '—';
        }
        
        // Ставка
        if (tipObj.totalStake) {
            tip.stake = `£${tipObj.totalStake}`;
        }
        
        return tip;
        
    } catch (error) {
        console.error('Ошибка парсинга объекта прогноза:', error);
        return null;
    }
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

// Тестовая функция для отладки
async function testParse() {
    console.log('=== ТЕСТ ПАРСЕРА ===');
    console.log('Тест: Прямой запрос к Tipstrr...');
    
    try {
        const testUrl = 'https://tipstrr.com/tipster/freguli/results';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(testUrl)}`;
        
        const response = await fetch(proxyUrl);
        const html = await response.text();
        
        console.log('HTML получен, размер:', html.length, 'символов');
        
        // Ищем JSON
        const jsonMatch = html.match(/"PORTFOLIO_TIP_CACHED"[^{]+\{[\s\S]+?\}\s*\}/);
        if (jsonMatch) {
            console.log('JSON найден в HTML');
            console.log('Длина JSON:', jsonMatch[0].length);
            
            const data = extractAndParseData(html, 10);
            console.log('Извлечено записей:', data.length);
            
            if (data.length > 0) {
                console.log('Первая запись:', data[0]);
                parsedData = data;
                showResults();
                alert('Тест успешен! Найдено данных: ' + data.length);
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
        console.error('Тест ошибка:', error);
    }
    
    console.log('Тест 2: Загружаю демо-данные');
    loadDemoData();
    
    return false;
}

// Авто-тест при загрузке
setTimeout(() => {
    console.log('Парсер готов. Нажмите "Парсить" или вызовите testParse() в консоли.');
}, 1000);
