let parsedData = [];

document.addEventListener('DOMContentLoaded', function() {
    console.log('Парсер загружен');
    document.getElementById('parse-btn').addEventListener('click', parseData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
});

async function parseData() {
    const url = document.getElementById('url-input').value; // URL из поля ввода
    const count = parseInt(document.getElementById('count-select').value);
    
    showLoading(true);
    
    try {
        console.log('Загружаю страницу...');
        // 1. Загружаем HTML страницы через прокси
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        
        const html = await response.text();
        console.log('HTML загружен, размер:', html.length, 'символов');
        
        // 2. Парсим данные прямо из загруженного HTML
        parsedData = extractAndParseData(html, count);
        
        // 3. Показываем результат
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

// ОСНОВНАЯ ФУНКЦИЯ: Извлечение и парсинг данных из HTML
function extractAndParseData(html, limit) {
    const data = [];
    
    try {
        // Шаг 1: Находим скрипт, содержащий объект с данными
        // Ищем паттерн, похожий на инициализацию состояния
        const scriptRegex = /<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i;
        const match = html.match(scriptRegex);
        
        if (match && match[1]) {
            console.log('Найден скрипт с INITIAL_STATE');
            
            // Пытаемся распарсить JSON
            // Убираем возможные лишние символы в конце для надежности
            let jsonStr = match[1];
            // Ищем конец JSON объекта по балансу скобок (простой метод)
            let openBraces = 0;
            let endIndex = 0;
            
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
                
                // Шаг 2: Извлекаем данные из структуры PORTFOLIO_TIP_CACHED
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
                
                // Шаг 3: Если в кеше мало, смотрим в PORTFOLIO_COMPLETED_TIPS
                if (data.length < limit && initialState.PORTFOLIO_COMPLETED_TIPS) {
                    console.log('Добираем из PORTFOLIO_COMPLETED_TIPS');
                    const completed = initialState.PORTFOLIO_COMPLETED_TIPS;
                    
                    for (const portfolioKey in completed) {
                        const tipsArray = completed[portfolioKey];
                        
                        for (const shortTip of tipsArray) {
                            if (data.length >= limit) break;
                            
                            // Пытаемся найти полные данные в кеше по ключу
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

// Функция парсинга одного прогноза из JSON-объекта
function parseSingleTip(tipObj) {
    try {
        const tip = {};
        
        // 1. Дата
        if (tipObj.tipDate) {
            const date = new Date(tipObj.tipDate);
            tip.date = date.toISOString().split('T')[0]; // Формат ГГГГ-ММ-ДД
        } else if (tipObj.dateAdded) {
            const date = new Date(tipObj.dateAdded);
            tip.date = date.toISOString().split('T')[0];
        }
        
        // 2. Название матча
        tip.event = tipObj.title || 'Неизвестный матч';
        
        // 3. Прогноз и коэффициент (из tipBetItem)
        if (tipObj.tipBetItem && tipObj.tipBetItem.length > 0) {
            const betItem = tipObj.tipBetItem[0];
            tip.prediction = `${betItem.marketText || 'Прогноз'} • ${betItem.betText || ''}`;
            tip.odds = betItem.finalOdds || betItem.createdOdds || '';
        } else {
            tip.prediction = 'Данные о прогнозе отсутствуют';
            tip.odds = '';
        }
        
        // 4. Результат
        // result: 1 = выигрыш, 3 = проигрыш
        if (tipObj.result === 1) {
            tip.result = '✅';
        } else if (tipObj.result === 3) {
            tip.result = '❌';
        } else {
            tip.result = '➖';
        }
        
        // 5. Прибыль
        if (tipObj.profit !== undefined && tipObj.profit !== null) {
            // profit уже в десятичном формате (например, -1, 0.632)
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
        
        // 6. Ставка
        if (tipObj.totalStake) {
            tip.stake = `£${tipObj.totalStake}`;
        }
        
        return tip;
        
    } catch (error) {
        console.error('Ошибка парсинга объекта прогноза:', error);
        return null;
    }
}

// Функции showResults, exportToExcel, showLoading, loadDemoData остаются БЕЗ ИЗМЕНЕНИЙ
// (используйте код из предыдущего ответа, начиная с функции showResults)
