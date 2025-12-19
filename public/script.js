// Парсинг данных
async function parseData() {
    const url = document.getElementById('url-input').value;
    const count = parseInt(document.getElementById('count-select').value);
    
    showLoading(true);
    
    try {
        console.log('Загружаю через прокси...');
        
        // Используем другой прокси или метод
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        // ИЛИ альтернативный CORS прокси
        // const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        
        const data = await response.json();
        const html = data.contents || data;
        console.log('HTML получен, размер:', html.length, 'символов');
        
        // Попробуем другой метод поиска данных
        parsedData = extractAndParseDataV2(html, count);
        
        // Если не нашли, пробуем альтернативный метод
        if (parsedData.length === 0) {
            parsedData = extractAndParseDataFallback(html, count);
        }
        
        showResults();
        document.getElementById('export-btn').disabled = parsedData.length === 0;
        
        console.log(`Найдено записей: ${parsedData.length}`);
        
        if (parsedData.length === 0) {
            alert('На странице не найдено данных. Возможно, требуется авторизация или структура страницы изменилась.');
            loadDemoData();
        } else {
            alert(`Успешно! Распарсено ${parsedData.length} прогнозов.`);
        }
        
    } catch (error) {
        console.error('Критическая ошибка:', error);
        alert('Ошибка: ' + error.message);
        loadDemoData();
    } finally {
        showLoading(false);
    }
}

// Альтернативный метод парсинга V2
function extractAndParseDataV2(html, limit) {
    const data = [];
    
    try {
        // Ищем JSON данные в скриптах
        const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        const scripts = html.match(scriptRegex) || [];
        
        for (const script of scripts) {
            if (script.includes('__INITIAL_STATE__') || script.includes('PORTFOLIO')) {
                console.log('Найден скрипт с данными');
                
                // Пытаемся извлечь JSON
                const jsonMatch = script.match(/{[\s\S]+}/);
                if (jsonMatch) {
                    try {
                        const jsonStr = jsonMatch[0]
                            .replace(/&quot;/g, '"')
                            .replace(/&#x27;/g, "'");
                        
                        const jsonData = JSON.parse(jsonStr);
                        console.log('JSON успешно распарсен:', Object.keys(jsonData));
                        
                        // Ищем данные в разных возможных местах
                        const possiblePaths = [
                            'PORTFOLIO_TIP_CACHED',
                            'PORTFOLIO_COMPLETED_TIPS',
                            'tips',
                            'completedTips',
                            'data'
                        ];
                        
                        for (const path of possiblePaths) {
                            if (jsonData[path]) {
                                console.log(`Найдены данные в ${path}`);
                                const tips = extractTipsFromObject(jsonData[path], limit);
                                data.push(...tips);
                                break;
                            }
                        }
                        
                    } catch (e) {
                        console.log('Не удалось распарсить JSON напрямую');
                    }
                }
            }
        }
        
        // Если не нашли в скриптах, ищем в data-атрибутах
        if (data.length === 0) {
            const dataRegex = /data-tip=['"]([^'"]+)['"]/gi;
            let match;
            while ((match = dataRegex.exec(html)) !== null && data.length < limit) {
                try {
                    const tipData = JSON.parse(match[1]);
                    const parsed = parseSingleTip(tipData);
                    if (parsed) data.push(parsed);
                } catch (e) {
                    // Пропускаем некорректные данные
                }
            }
        }
        
    } catch (error) {
        console.error('Ошибка в extractAndParseDataV2:', error);
    }
    
    return data.slice(0, limit);
}

// Fallback метод - парсим HTML структуру
function extractAndParseDataFallback(html, limit) {
    const data = [];
    
    try {
        // Создаем временный DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Ищем таблицы, списки прогнозов
        const rows = doc.querySelectorAll('tr, .tip-item, .prediction, [class*="tip"], [class*="prediction"]');
        
        console.log(`Найдено элементов: ${rows.length}`);
        
        for (let i = 0; i < Math.min(rows.length, limit); i++) {
            const row = rows[i];
            const text = row.textContent.trim();
            
            if (text.length > 50) { // Фильтруем мусор
                const tip = parseFromHTML(row);
                if (tip) data.push(tip);
            }
        }
        
    } catch (error) {
        console.error('Ошибка в fallback парсере:', error);
    }
    
    return data;
}

// Парсинг из HTML элемента
function parseFromHTML(element) {
    try {
        const tip = {};
        const text = element.textContent.trim();
        
        // Простая эвристика для извлечения данных
        const dateMatch = text.match(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/);
        if (dateMatch) tip.date = dateMatch[0];
        
        // Ищем название события (обычно содержит vs или -)
        const eventMatch = text.match(/([A-Za-z0-9\s\.\-]+)(?:\s+vs\s+|\s+-\s+)([A-Za-z0-9\s\.\-]+)/);
        if (eventMatch) {
            tip.event = `${eventMatch[1]} v ${eventMatch[2]}`;
        }
        
        // Ищем коэффициенты (числа с точкой)
        const oddsMatch = text.match(/\d+\.\d{2}/);
        if (oddsMatch) tip.odds = oddsMatch[0];
        
        // Определяем результат по символам
        if (text.includes('✅') || text.includes('WON') || text.includes('WIN')) {
            tip.result = '✅';
        } else if (text.includes('❌') || text.includes('LOST') || text.includes('LOSS')) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        tip.prediction = 'Извлечено из HTML';
        
        return tip;
        
    } catch (error) {
        console.error('Ошибка parseFromHTML:', error);
        return null;
    }
}
