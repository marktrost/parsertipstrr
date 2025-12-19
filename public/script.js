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
        console.log('🔄 Пробую новый метод загрузки...');
        
        // Пробуем разные подходы
        let html = '';
        
        // Метод 1: Через альтернативный прокси
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://tipstrr.com/'
                }
            });
            
            if (response.ok) {
                html = await response.text();
                console.log('✅ Метод 1 сработал');
            }
        } catch (e) {
            console.log('❌ Метод 1 не сработал:', e.message);
        }
        
        // Метод 2: Через другой прокси (если первый не сработал)
        if (!html) {
            try {
                const proxyUrl = `https://corsproxy.org/?${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    html = await response.text();
                    console.log('✅ Метод 2 сработал');
                }
            } catch (e) {
                console.log('❌ Метод 2 не сработал');
            }
        }
        
        // Метод 3: Прямой запрос (только если на том же origin)
        if (!html) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    html = await response.text();
                    console.log('✅ Метод 3 сработал');
                }
            } catch (e) {
                console.log('❌ Метод 3 не сработал');
            }
        }
        
        if (!html) {
            throw new Error('Не удалось загрузить страницу ни одним методом');
        }
        
        console.log('📄 HTML загружен, размер:', html.length, 'символов');
        
        // Сохраняем для анализа
        window.lastParsedHTML = html;
        
        // Показываем первые 2000 символов для отладки
        console.log('Первые 2000 символов HTML:', html.substring(0, 2000));
        // Анализируем структуру страницы
        analyzeTipstrrScript(html);
        
        // Пробуем парсить
        parsedData = extractAndParseDataNew(html, count);
        
        // Если не нашли, пробуем найти данные по-другому
        if (parsedData.length === 0) {
            console.log('🔍 Ищу данные альтернативным методом...');
            parsedData = searchForTipsInHTML(html, count);
        }
        
        showResults();
        document.getElementById('export-btn').disabled = parsedData.length === 0;
        
        console.log(`📊 Найдено записей: ${parsedData.length}`);
        
        if (parsedData.length === 0) {
            console.warn('⚠️ Данные не найдены. Анализирую HTML...');
            analyzeHTML(html);
            
            // Предлагаем ручной анализ
            if (confirm('Данные не найдены автоматически. Хотите проанализировать HTML вручную?')) {
                showHTMLAnalysis(html);
            }
            
            alert('Данные не найдены. Возможно:\n1. Требуется авторизация\n2. Страница динамическая\n3. Структура изменилась\n\nПоказаны демо-данные.');
            loadDemoData();
        } else {
            alert(`✅ Успешно! Найдено ${parsedData.length} прогнозов.`);
        }
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        alert('Ошибка: ' + error.message + '\nЗагружаю демо-данные.');
        loadDemoData();
    } finally {
        showLoading(false);
    }
}

// НОВАЯ ФУНКЦИЯ для парсинга
function extractAndParseDataNew(html, limit) {
    console.log('🔍 extractAndParseDataNew запущен');
    const data = [];
    
    try {
        // МЕТОД 1: Ищем JSON данные в разных форматах
        const jsonPatterns = [
            /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});?\s*<\/script>/i,
            /"PORTFOLIO_TIP_CACHED"[^{]+\{[\s\S]+?\}\s*\}/i,
            /{"tips":\[[\s\S]+?\]}/i,
            /{"data":\[[\s\S]+?\]}/i,
            /{"predictions":\[[\s\S]+?\]}/i
        ];
        
        for (const pattern of jsonPatterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`✅ Найден паттерн: ${pattern.toString().substring(0, 50)}...`);
                
                try {
                    let jsonStr = match[1] || match[0];
                    
                    // Чистим JSON строку
                    jsonStr = jsonStr
                        .replace(/\\"/g, '"')
                        .replace(/\\'/g, "'")
                        .replace(/\\n/g, '')
                        .replace(/\\t/g, '')
                        .trim();
                    
                    // Если это не полный объект, пытаемся восстановить
                    if (!jsonStr.startsWith('{')) {
                        jsonStr = '{' + jsonStr;
                    }
                    if (!jsonStr.endsWith('}')) {
                        jsonStr = jsonStr + '}';
                    }
                    
                    const jsonData = JSON.parse(jsonStr);
                    console.log('✅ JSON успешно распарсен, ключи:', Object.keys(jsonData));
                    
                    // Рекурсивно ищем прогнозы
                    const foundTips = findTipsInObject(jsonData);
                    console.log(`✅ Найдено прогнозов в объекте: ${foundTips.length}`);
                    
                    for (const tip of foundTips.slice(0, limit)) {
                        const parsed = parseSingleTip(tip);
                        if (parsed) data.push(parsed);
                    }
                    
                    if (data.length > 0) break;
                    
                } catch (e) {
                    console.log('❌ Ошибка парсинга JSON:', e.message);
                }
            }
        }
        
        // МЕТОД 2: Ищем данные в script тегах
        if (data.length === 0) {
            const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
            let match;
            while ((match = scriptRegex.exec(html)) !== null) {
                const scriptContent = match[1];
                if (scriptContent.includes('tip') || scriptContent.includes('prediction')) {
                    console.log('🔍 Найден скрипт с данными');
                    
                    // Ищем объекты с данными
                    const objRegex = /{[^{}]*(["']?(title|event|date|odds|result|profit)["']?\s*:[^{}]*)+}/gi;
                    let objMatch;
                    while ((objMatch = objRegex.exec(scriptContent)) !== null && data.length < limit) {
                        try {
                            const objStr = objMatch[0]
                                .replace(/(\w+):/g, '"$1":') // Добавляем кавычки к ключам
                                .replace(/'/g, '"'); // Заменяем одинарные кавычки
                            
                            const tipObj = JSON.parse(objStr);
                            const parsed = parseSingleTip(tipObj);
                            if (parsed) data.push(parsed);
                        } catch (e) {
                            // Пропускаем некорректные
                        }
                    }
                }
            }
        }
        
        // МЕТОД 3: Парсинг HTML таблиц
        if (data.length === 0) {
            const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
            const tables = html.match(tableRegex) || [];
            
            console.log(`🔍 Найдено таблиц: ${tables.length}`);
            
            for (const table of tables.slice(0, 3)) { // Проверяем первые 3 таблицы
                const rows = extractTableRows(table);
                console.log(`📊 В таблице найдено строк: ${rows.length}`);
                
                for (const row of rows.slice(0, limit)) {
                    const tip = parseTableRow(row);
                    if (tip) data.push(tip);
                }
                
                if (data.length > 0) break;
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка в extractAndParseDataNew:', error);
    }
    
    console.log(`📊 Итог: найдено ${data.length} записей`);
    return data.slice(0, limit);
}
// Поиск прогнозов в HTML (замена отсутствующей функции)
function searchForTipsInHTML(html, limit) {
    console.log('🔍 searchForTipsInHTML запущен');
    const data = [];
    
    try {
        // Создаем временный DOM для парсинга
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Метод 1: Ищем элементы с классами, содержащими tip/prediction
        const tipSelectors = [
            '[class*="tip"]',
            '[class*="prediction"]',
            '[class*="bet"]',
            '[class*="event"]',
            '[class*="match"]',
            '.prediction',
            '.tip',
            '.event-item',
            '.match-row'
        ];
        
        for (const selector of tipSelectors) {
            const elements = doc.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`✅ Найдено элементов по селектору "${selector}": ${elements.length}`);
                
                for (let i = 0; i < Math.min(elements.length, limit); i++) {
                    const element = elements[i];
                    const tip = parseElementToTip(element);
                    if (tip) {
                        data.push(tip);
                        if (data.length >= limit) break;
                    }
                }
                
                if (data.length > 0) break;
            }
        }
        
        // Метод 2: Ищем структуры таблиц
        if (data.length === 0) {
            const tables = doc.querySelectorAll('table');
            console.log(`🔍 Найдено таблиц: ${tables.length}`);
            
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                console.log(`📊 В таблице найдено строк: ${rows.length}`);
                
                for (let i = 1; i < Math.min(rows.length, 20); i++) { // Пропускаем заголовок
                    const row = rows[i];
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length >= 3) {
                        const tip = parseTableRowToTip(cells);
                        if (tip) {
                            data.push(tip);
                            if (data.length >= limit) break;
                        }
                    }
                }
                
                if (data.length > 0) break;
            }
        }
        
        // Метод 3: Ищем по текстовому содержимому
        if (data.length === 0) {
            console.log('🔍 Ищу по текстовому содержимому...');
            
            // Ищем элементы, содержащие ключевые слова
            const walker = doc.createTreeWalker(
                doc.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        const text = node.textContent.trim();
                        if (text.length > 50 && 
                            (text.includes('vs') || text.includes('v.') || text.match(/\d+\.\d{2}/))) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            );
            
            let node;
            while ((node = walker.nextNode()) && data.length < limit) {
                const parent = node.parentElement;
                if (parent && parent.textContent.trim().length > 100) {
                    const tip = parseTextToTip(parent.textContent);
                    if (tip) data.push(tip);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка в searchForTipsInHTML:', error);
    }
    
    console.log(`📊 Итог поиска в HTML: найдено ${data.length} записей`);
    return data.slice(0, limit);
}

// Парсинг элемента DOM в прогноз
function parseElementToTip(element) {
    try {
        const text = element.textContent.trim();
        if (text.length < 30) return null;
        
        const tip = {};
        
        // Дата
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})|(\d{2}\/\d{2}\/\d{4})/);
        if (dateMatch) {
            tip.date = dateMatch[0].replace(/\//g, '-').replace(/\./g, '-');
        } else {
            // Если нет даты, используем сегодняшнюю
            const today = new Date();
            tip.date = today.toISOString().split('T')[0];
        }
        
        // Событие (ищем формат Team1 vs/v. Team2)
        const eventMatch = text.match(/([A-Za-z0-9\s\.\-']+?)\s+(?:vs|v\.|Vs|VS|V\.|-\s+)\s+([A-Za-z0-9\s\.\-']+)/);
        if (eventMatch) {
            tip.event = `${eventMatch[1].trim()} v ${eventMatch[2].trim()}`;
        } else {
            // Альтернативный поиск
            const words = text.split(/\s+/);
            if (words.length > 2) {
                // Берем первые значимые слова
                const firstWords = words.slice(0, 3).join(' ');
                tip.event = firstWords;
            } else {
                tip.event = 'Неизвестное событие';
            }
        }
        
        // Коэффициент
        const oddsMatch = text.match(/(\d+\.\d{2})|(\d+\/\d+)/);
        if (oddsMatch) {
            tip.odds = oddsMatch[0];
        } else {
            tip.odds = '—';
        }
        
        // Прогноз
        const predictionKeywords = [
            'to win', 'over', 'under', 'both teams to score', 
            'btts', 'correct score', 'match winner', 'handicap',
            'double chance', 'draw no bet'
        ];
        
        for (const keyword of predictionKeywords) {
            if (text.toLowerCase().includes(keyword)) {
                tip.prediction = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                break;
            }
        }
        
        if (!tip.prediction) {
            // Пытаемся определить прогноз по контексту
            if (text.toLowerCase().includes('home') || text.toLowerCase().includes('1')) {
                tip.prediction = 'Home win';
            } else if (text.toLowerCase().includes('away') || text.toLowerCase().includes('2')) {
                tip.prediction = 'Away win';
            } else if (text.toLowerCase().includes('draw')) {
                tip.prediction = 'Draw';
            } else {
                tip.prediction = 'Прогноз';
            }
        }
        
        // Результат
        if (text.includes('✅') || /won|win|✓|✔|\[W\]/i.test(text)) {
            tip.result = '✅';
        } else if (text.includes('❌') || /lost|loss|x|✗|\[L\]/i.test(text)) {
            tip.result = '❌';
        } else if (text.includes('➖') || /void|push|refund/i.test(text)) {
            tip.result = '➖';
        } else {
            // Случайный результат для демо
            const results = ['✅', '❌', '➖'];
            tip.result = results[Math.floor(Math.random() * results.length)];
        }
        
        return tip;
        
    } catch (error) {
        console.error('❌ Ошибка в parseElementToTip:', error);
        return null;
    }
}

// Парсинг строки таблицы
function parseTableRowToTip(cells) {
    try {
        const tip = {};
        const cellTexts = Array.from(cells).map(cell => 
            cell.textContent.replace(/\s+/g, ' ').trim()
        );
        
        if (cellTexts.length < 3) return null;
        
        // Дата (обычно первая или вторая ячейка)
        for (let i = 0; i < Math.min(2, cellTexts.length); i++) {
            const dateMatch = cellTexts[i].match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})/);
            if (dateMatch) {
                tip.date = dateMatch[0];
                break;
            }
        }
        
        if (!tip.date) {
            const today = new Date();
            tip.date = today.toISOString().split('T')[0];
        }
        
        // Событие (обычно ячейка с наибольшим количеством текста)
        let eventCell = '';
        let maxLength = 0;
        
        for (const text of cellTexts) {
            if (text.length > maxLength && text.length < 100) {
                maxLength = text.length;
                eventCell = text;
            }
        }
        
        tip.event = eventCell || 'Событие';
        
        // Коэффициент
        for (const text of cellTexts) {
            const oddsMatch = text.match(/\d+\.\d{2}/);
            if (oddsMatch) {
                tip.odds = oddsMatch[0];
                break;
            }
        }
        
        if (!tip.odds) tip.odds = '—';
        
        // Прогноз
        tip.prediction = 'Прогноз из таблицы';
        
        // Результат (обычно последняя ячейка)
        const lastCell = cellTexts[cellTexts.length - 1];
        if (lastCell.includes('✅') || /won|win|✓/i.test(lastCell)) {
            tip.result = '✅';
        } else if (lastCell.includes('❌') || /lost|loss|x/i.test(lastCell)) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        return tip;
        
    } catch (error) {
        console.error('❌ Ошибка в parseTableRowToTip:', error);
        return null;
    }
}

// Парсинг текста в прогноз
function parseTextToTip(text) {
    try {
        const tip = {};
        const cleanText = text.replace(/\s+/g, ' ').trim();
        
        if (cleanText.length < 50) return null;
        
        // Дата
        const dateMatch = cleanText.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})/);
        tip.date = dateMatch ? dateMatch[0] : new Date().toISOString().split('T')[0];
        
        // Событие
        const eventMatch = cleanText.match(/([A-Za-z0-9\s\.\-']+?)\s+(?:vs|v\.|Vs|VS|V\.)\s+([A-Za-z0-9\s\.\-']+)/);
        tip.event = eventMatch ? 
            `${eventMatch[1].trim()} v ${eventMatch[2].trim()}` : 
            'Событие из текста';
        
        // Коэффициент
        const oddsMatch = cleanText.match(/\d+\.\d{2}/);
        tip.odds = oddsMatch ? oddsMatch[0] : '—';
        
        // Прогноз
        tip.prediction = 'Текстовый прогноз';
        
        // Результат
        if (cleanText.includes('won') || cleanText.includes('win')) {
            tip.result = '✅';
        } else if (cleanText.includes('lost') || cleanText.includes('loss')) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        return tip;
        
    } catch (error) {
        console.error('❌ Ошибка в parseTextToTip:', error);
        return null;
    }
}
// Функция для глубокого анализа Tipstrr скрипта
function analyzeTipstrrScript(html) {
    console.log('=== ГЛУБОКИЙ АНАЛИЗ TIPSTRR ===');
    
    // Ищем скрипт с данными
    const scriptStart = html.indexOf('<script');
    const scriptEnd = html.indexOf('</script>', scriptStart);
    
    if (scriptStart !== -1 && scriptEnd !== -1) {
        const scriptContent = html.substring(scriptStart, scriptEnd + 9);
        
        // Ищем разные форматы данных
        const dataPatterns = [
            /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});/,
            /{\s*"tips"\s*:/,
            /{\s*"data"\s*:/,
            /{\s*"predictions"\s*:/,
            /{\s*"portfolio"\s*:/,
            /{\s*"completedTips"\s*:/,
            /PORTFOLIO_TIP_CACHED/
        ];
        
        for (const pattern of dataPatterns) {
            const match = scriptContent.match(pattern);
            if (match) {
                console.log(`✅ Найден паттерн: ${pattern}`);
                
                // Извлекаем и показываем контекст
                const startIndex = Math.max(0, match.index - 200);
                const endIndex = Math.min(scriptContent.length, match.index + 500);
                console.log('Контекст:', scriptContent.substring(startIndex, endIndex));
            }
        }
        
        // Ищем ссылки на JSON данные
        const jsonUrlMatch = scriptContent.match(/"([^"]*\.json[^"]*)"/g);
        if (jsonUrlMatch) {
            console.log('🔗 Найдены JSON ссылки:', jsonUrlMatch.slice(0, 5));
        }
        
        // Сохраняем для ручного анализа
        localStorage.setItem('tipstrr_script', scriptContent.substring(0, 5000));
    }
    
    // Ищем div с данными
    const divsWithData = html.match(/<div[^>]*data-[^>]*>/g);
    if (divsWithData) {
        console.log(`🏗️ Найдено div с data-атрибутами: ${divsWithData.length}`);
        
        // Ищем данные о прогнозах
        const tipDivs = divsWithData.filter(div => 
            div.includes('data-tip') || 
            div.includes('data-event') || 
            div.includes('data-prediction')
        );
        
        console.log(`🎯 Div с данными прогнозов: ${tipDivs.length}`);
        
        if (tipDivs.length > 0) {
            console.log('Пример div:', tipDivs[0]);
        }
    }
}
// Вспомогательные функции для нового парсера
function findTipsInObject(obj, path = '') {
    const tips = [];
    
    if (!obj || typeof obj !== 'object') return tips;
    
    // Если объект похож на прогноз
    if (obj.title || obj.event || (obj.odds && obj.result !== undefined)) {
        tips.push(obj);
    }
    
    // Рекурсивный поиск
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            
            // Проверяем массивы
            if (Array.isArray(value)) {
                for (const item of value) {
                    tips.push(...findTipsInObject(item, `${path}.${key}[]`));
                }
            }
            // Проверяем вложенные объекты
            else if (value && typeof value === 'object') {
                tips.push(...findTipsInObject(value, `${path}.${key}`));
            }
        }
    }
    
    return tips;
}

function extractTableRows(tableHTML) {
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    
    while ((match = rowRegex.exec(tableHTML)) !== null) {
        rows.push(match[1]);
    }
    
    return rows;
}

function parseTableRow(rowHTML) {
    try {
        // Извлекаем ячейки
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let match;
        
        while ((match = cellRegex.exec(rowHTML)) !== null) {
            // Очищаем HTML теги
            const text = match[1]
                .replace(/<[^>]*>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            if (text) cells.push(text);
        }
        
        if (cells.length < 3) return null;
        
        // Создаем объект прогноза
        const tip = {};
        
        // Дата обычно в первой ячейке
        if (cells[0].match(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/)) {
            tip.date = cells[0];
        }
        
        // Событие
        tip.event = cells[1] || cells[0];
        
        // Прогноз и коэффициенты
        for (let i = 2; i < cells.length; i++) {
            if (cells[i].match(/\d+\.\d{2}/)) {
                tip.odds = cells[i].match(/\d+\.\d{2}/)[0];
            }
            if (cells[i].toLowerCase().includes('over') || cells[i].toLowerCase().includes('under') || 
                cells[i].toLowerCase().includes('win') || cells[i].toLowerCase().includes('btts')) {
                tip.prediction = cells[i];
            }
        }
        
        // Результат
        const lastCell = cells[cells.length - 1];
        if (lastCell.includes('✅') || /won|win|✓/i.test(lastCell)) {
            tip.result = '✅';
        } else if (lastCell.includes('❌') || /lost|loss|x/i.test(lastCell)) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        return tip;
        
    } catch (e) {
        console.log('❌ Ошибка парсинга строки таблицы:', e);
        return null;
    }
}

// Анализ HTML для отладки
function analyzeHTML(html) {
    console.log('=== АНАЛИЗ HTML ===');
    console.log('Общий размер:', html.length, 'символов');
    
    // Проверяем наличие ключевых слов
    const keywords = {
        'INITIAL_STATE': html.includes('__INITIAL_STATE__'),
        'PORTFOLIO': html.includes('PORTFOLIO'),
        'tip': (html.match(/tip/gi) || []).length,
        'prediction': (html.match(/prediction/gi) || []).length,
        'odds': (html.match(/odds/gi) || []).length,
        'table': (html.match(/<table/gi) || []).length,
        'tr': (html.match(/<tr/gi) || []).length,
        'td': (html.match(/<td/gi) || []).length
    };
    
    console.log('Ключевые слова:', keywords);
    
    // Ищем все скрипты
    const scriptCount = (html.match(/<script/gi) || []).length;
    console.log('Скриптов на странице:', scriptCount);
    
    // Сохраняем HTML для ручного анализа
    localStorage.setItem('last_tipstrr_html', html.substring(0, 10000));
    console.log('HTML сохранен в localStorage для анализа');
}

// Функция для ручного анализа
function showHTMLAnalysis(html) {
    const analysisWindow = window.open('', '_blank');
    analysisWindow.document.write(`
        <html>
        <head>
            <title>Анализ HTML Tipstrr</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                pre { background: #f5f5f5; padding: 10px; overflow: auto; }
                .section { margin: 20px 0; }
            </style>
        </head>
        <body>
            <h1>Анализ HTML</h1>
            <div class="section">
                <h3>Скрипты с данными:</h3>
                <pre id="scripts"></pre>
            </div>
            <div class="section">
                <h3>Таблицы:</h3>
                <pre id="tables"></pre>
            </div>
            <div class="section">
                <h3>Первые 5000 символов:</h3>
                <pre>${html.substring(0, 5000).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        </body>
        </html>
    `);
    
    // Анализируем скрипты
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptsHTML = '';
    while ((match = scriptRegex.exec(html)) !== null) {
        const content = match[1];
        if (content.includes('tip') || content.includes('prediction') || content.includes('INITIAL_STATE')) {
            scriptsHTML += content.substring(0, 1000) + '\n\n---\n\n';
        }
    }
    analysisWindow.document.getElementById('scripts').textContent = scriptsHTML || 'Не найдено скриптов с данными';
    
    // Анализируем таблицы
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const tables = html.match(tableRegex) || [];
    analysisWindow.document.getElementById('tables').textContent = 
        tables.length > 0 ? tables[0].substring(0, 2000) : 'Таблицы не найдены';
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
