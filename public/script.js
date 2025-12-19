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
        
        // Сохраняем HTML для отладки
        window.lastHTML = html;
        
        // Пробуем разные методы парсинга
        parsedData = extractAndParseData(html, count);
        
        // Если не нашли, пробуем альтернативный метод
        if (parsedData.length === 0) {
            console.log('Первый метод не сработал, пробую альтернативный...');
            parsedData = extractAndParseDataV2(html, count);
        }
        
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

// Извлечение и парсинг данных из HTML (основной метод)
function extractAndParseData(html, limit) {
    const data = [];
    
    try {
        // Ищем скрипт с INITIAL_STATE
        const scriptRegex = /<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i;
        const match = html.match(scriptRegex);
        
        if (match && match[1]) {
            console.log('✅ Найден скрипт с INITIAL_STATE');
            
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
                console.log('✅ JSON успешно распарсен. Ключи:', Object.keys(initialState));
                
                // Ищем данные в PORTFOLIO_TIP_CACHED
                if (initialState.PORTFOLIO_TIP_CACHED) {
                    console.log('✅ Обнаружен PORTFOLIO_TIP_CACHED');
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
                    console.log(`✅ Обработано из кеша: ${data.length}`);
                }
                
                // Добираем из PORTFOLIO_COMPLETED_TIPS
                if (data.length < limit && initialState.PORTFOLIO_COMPLETED_TIPS) {
                    console.log('✅ Добираем из PORTFOLIO_COMPLETED_TIPS');
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
                console.error('❌ Ошибка парсинга JSON из скрипта:', jsonError);
            }
        } else {
            console.log('❌ Скрипт с INITIAL_STATE не найден');
        }
        
    } catch (error) {
        console.error('❌ Ошибка в extractAndParseData:', error);
    }
    
    return data.slice(0, limit);
}

// Альтернативный метод парсинга V2
function extractAndParseDataV2(html, limit) {
    const data = [];
    
    try {
        console.log('🔍 Запускаю альтернативный парсинг...');
        
        // Ищем любые JSON данные в HTML
        const jsonRegex = /{\s*"[^"]+"\s*:\s*{[^}]+}|\[[^\]]+\]/g;
        const jsonMatches = html.match(jsonRegex) || [];
        
        console.log(`Найдено JSON блоков: ${jsonMatches.length}`);
        
        for (const jsonStr of jsonMatches.slice(0, 10)) { // Проверяем первые 10
            try {
                if (jsonStr.length > 100 && jsonStr.includes('tip')) {
                    const obj = JSON.parse(jsonStr);
                    
                    // Рекурсивно ищем данные о прогнозах
                    const tips = findTipsRecursive(obj);
                    if (tips.length > 0) {
                        console.log(`Найдено ${tips.length} прогнозов в JSON блоке`);
                        for (const tip of tips.slice(0, limit - data.length)) {
                            const parsed = parseSingleTip(tip);
                            if (parsed) data.push(parsed);
                        }
                    }
                }
            } catch (e) {
                // Пропускаем некорректный JSON
            }
        }
        
        // Если все еще нет данных, ищем в структуре HTML
        if (data.length === 0) {
            console.log('🔍 Ищу данные в HTML структуре...');
            
            // Создаем временный DOM
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Ищем таблицы или списки
            const rows = doc.querySelectorAll('tr, .row, .item, [class*="tip"], [class*="prediction"]');
            console.log(`Найдено HTML элементов: ${rows.length}`);
            
            for (let i = 0; i < Math.min(rows.length, 20); i++) {
                const row = rows[i];
                const text = row.textContent.trim();
                
                if (text.length > 30 && !text.includes('script') && !text.includes('function')) {
                    const tip = parseFromHTML(row);
                    if (tip) {
                        data.push(tip);
                        if (data.length >= limit) break;
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка в альтернативном парсере:', error);
    }
    
    return data.slice(0, limit);
}

// Рекурсивный поиск прогнозов в объекте
function findTipsRecursive(obj, depth = 0) {
    const tips = [];
    
    if (depth > 5) return tips; // Ограничиваем глубину
    
    if (obj && typeof obj === 'object') {
        // Проверяем, похож ли объект на прогноз
        if (obj.title || obj.tipDate || obj.result !== undefined) {
            tips.push(obj);
        }
        
        // Рекурсивно проверяем все свойства
        for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                tips.push(...findTipsRecursive(obj[key], depth + 1));
            }
        }
    }
    
    return tips;
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
        console.error('❌ Ошибка парсинга объекта прогноза:', error);
        return null;
    }
}

// Парсинг из HTML элемента
function parseFromHTML(element) {
    try {
        const tip = {};
        const text = element.textContent.trim();
        
        // Простая эвристика для извлечения данных
        const dateMatch = text.match(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/);
        if (dateMatch) tip.date = dateMatch[0];
        
        // Ищем название события
        const eventMatch = text.match(/([A-Za-z0-9\s\.\-]+)(?:\s+vs\s+|\s+-\s+|v\.)([A-Za-z0-9\s\.\-]+)/);
        if (eventMatch) {
            tip.event = `${eventMatch[1]} v ${eventMatch[2]}`;
        }
        
        // Ищем коэффициенты
        const oddsMatch = text.match(/\d+\.\d{2}/);
        if (oddsMatch) tip.odds = oddsMatch[0];
        
        // Определяем результат
        if (text.includes('✅') || text.includes('WON') || text.includes('WIN') || /won|win/i.test(text)) {
            tip.result = '✅';
        } else if (text.includes('❌') || text.includes('LOST') || text.includes('LOSS') || /lost|loss/i.test(text)) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        // Извлекаем прогноз
        const predictionKeywords = ['to win', 'over', 'under', 'both teams to score', 'btts', 'correct score'];
        for (const keyword of predictionKeywords) {
            if (text.toLowerCase().includes(keyword)) {
                tip.prediction = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                break;
            }
        }
        
        if (!tip.prediction) tip.prediction = 'Прогноз извлечен';
        
        return tip;
        
    } catch (error) {
        console.error('❌ Ошибка parseFromHTML:', error);
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

// =============================================
// ТЕСТОВАЯ ФУНКЦИЯ ДЛЯ ОТЛАДКИ (ОБНОВЛЕННАЯ)
// =============================================
async function testParse() {
    console.clear();
    console.log('%c=== ТЕСТ ПАРСЕРА TIPSTRR ===', 'color: green; font-size: 16px; font-weight: bold;');
    console.log('%cПроверяем доступность разных методов...', 'color: blue; font-weight: bold;');
    
    const testCases = [
        {
            name: 'Стандартный URL с /results',
            url: 'https://tipstrr.com/tipster/freguli/results',
            expected: 'Должен содержать историю прогнозов'
        },
        {
            name: 'Профиль без /results',
            url: 'https://tipstrr.com/tipster/freguli',
            expected: 'Основная страница профиля'
        },
        {
            name: 'С другим прокси',
            url: 'https://tipstrr.com/tipster',
            expected: 'Проверка прокси'
        }
    ];
    
    let foundData = false;
    
    for (const testCase of testCases) {
        console.log(`\n🔍 Тест: ${testCase.name}`);
        console.log(`URL: ${testCase.url}`);
        console.log(`Ожидание: ${testCase.expected}`);
        
        try {
            // Пробуем разные прокси
            const proxies = [
                `https://corsproxy.io/?${encodeURIComponent(testCase.url)}`,
                `https://api.allorigins.win/get?url=${encodeURIComponent(testCase.url)}`,
                `https://cors-anywhere.herokuapp.com/${testCase.url}`
            ];
            
            for (let i = 0; i < proxies.length; i++) {
                console.log(`Пробуем прокси ${i + 1}: ${proxies[i].substring(0, 50)}...`);
                
                try {
                    const response = await fetch(proxies[i], {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    if (response.ok) {
                        let html;
                        if (i === 1) { // allorigins
                            const data = await response.json();
                            html = data.contents;
                        } else {
                            html = await response.text();
                        }
                        
                        console.log(`✅ Прокси ${i + 1} работает. HTML размер: ${html.length} символов`);
                        
                        // Быстрый анализ контента
                        const hasInitialState = html.includes('__INITIAL_STATE__');
                        const hasPortfolio = html.includes('PORTFOLIO');
                        const hasTips = html.includes('tip') || html.includes('prediction');
                        
                        console.log(`📊 Анализ:`);
                        console.log(`   - INITIAL_STATE: ${hasInitialState ? '✅ Найден' : '❌ Не найден'}`);
                        console.log(`   - PORTFOLIO: ${hasPortfolio ? '✅ Найден' : '❌ Не найден'}`);
                        console.log(`   - Признаки прогнозов: ${hasTips ? '✅ Есть' : '❌ Нет'}`);
                        
                        // Если нашли данные, парсим
                        if (hasInitialState || hasPortfolio) {
                            const testData = extractAndParseData(html, 5);
                            if (testData.length > 0) {
                                console.log(`🎉 УСПЕХ! Найдено ${testData.length} прогнозов:`);
                                console.log(testData[0]);
                                foundData = true;
                                
                                // Автоматически устанавливаем этот URL и парсим
                                document.getElementById('url-input').value = testCase.url;
                                alert(`Тест успешен! Найдено данных с прокси ${i + 1}. URL установлен.`);
                                return true;
                            }
                        }
                        
                        // Сохраняем HTML для ручного анализа
                        if (!window.testHTMLs) window.testHTMLs = {};
                        window.testHTMLs[testCase.name] = html.substring(0, 5000);
                        
                        break; // Переходим к следующему тесту
                        
                    } else {
                        console.log(`❌ Прокси ${i + 1} не сработал: ${response.status}`);
                    }
                } catch (proxyError) {
                    console.log(`❌ Ошибка прокси ${i + 1}: ${proxyError.message}`);
                }
            }
            
        } catch (error) {
            console.log(`❌ Ошибка теста: ${error.message}`);
        }
    }
    
    if (!foundData) {
        console.log('\n⚠️  Ни один тест не нашел данных. Возможные причины:');
        console.log('1. Сайт изменил структуру');
        console.log('2. Все прокси заблокированы');
        console.log('3. Требуется авторизация');
        console.log('4. JavaScript рендеринг (нужен Puppeteer)');
        
        // Предлагаем альтернативы
        console.log('\n💡 Рекомендации:');
        console.log('1. Попробуйте вручную открыть URL в браузере');
        console.log('2. Проверьте, видите ли вы там прогнозы');
        console.log('3. Используйте DevTools (F12) чтобы найти данные');
        console.log('4. Для анализа: window.testHTMLs содержит загруженный HTML');
        
        alert('Тесты не нашли данных. Смотрите консоль для деталей. Загружаю демо-данные.');
        loadDemoData();
    }
    
    return foundData;
}

// Авто-тест при загрузке
setTimeout(() => {
    console.log('Парсер готов. Доступные команды:');
    console.log('1. Нажмите "Парсить"');
    console.log('2. Нажмите кнопку "Тест" или вызовите testParse() в консоли');
    console.log('3. Для анализа: window.lastHTML содержит последний загруженный HTML');
}, 1000);
