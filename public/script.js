// ====== ОСНОВНАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ВСЕХ ПРОГНОЗОВ ======
async function fetchAllTipsFromAPI(tipsterName = 'freguli', limit = 50) {
    console.log('📡 Запрашиваю данные через API...');
    
    try {
        // Базовый URL API (сконструирован на основе вашего запроса)
        const baseUrl = `https://tipstrr.com/tipster/${tipsterName}/completed`;
        
        // Массив для хранения всех прогнозов
        let allTips = [];
        let skip = 0;
        const batchSize = 20; // По сколько запрашивать за раз
        
        // Запрашиваем данные партиями, пока не соберем нужное количество
        while (allTips.length < limit) {
            console.log(`🔍 Запрашиваю прогнозы с skip=${skip}...`);
            
            const apiUrl = `${baseUrl}?skip=${skip}&limit=${batchSize}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка API: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`✅ Получено прогнозов: ${data.length || 0}`);
            
            // Если данных больше нет - выходим из цикла
            if (!data || data.length === 0) {
                console.log('📭 Больше данных нет');
                break;
            }
            
            // Парсим полученные данные
            const parsedTips = parseAPITips(data);
            allTips = allTips.concat(parsedTips);
            
            // Увеличиваем skip для следующей партии
            skip += batchSize;
            
            // Небольшая задержка, чтобы не нагружать сервер
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Ограничиваем общее количество
        allTips = allTips.slice(0, limit);
        console.log(`🎯 Итого получено прогнозов: ${allTips.length}`);
        
        return allTips;
        
    } catch (error) {
        console.error('❌ Ошибка при работе с API:', error);
        throw error;
    }
}

// ====== ПАРСИНГ ДАННЫХ ИЗ API ======
function parseAPITips(apiData) {
    const tips = [];
    
    // Проверяем формат данных
    console.log('📊 Формат данных API:', Array.isArray(apiData) ? 'Массив' : 'Объект');
    console.log('Пример элемента:', apiData[0]);
    
    // Если данные - массив, обрабатываем каждый элемент
    if (Array.isArray(apiData)) {
        apiData.forEach(item => {
            const tip = parseSingleAPITip(item);
            if (tip) tips.push(tip);
        });
    } 
    // Если данные в другом формате (например, объект с полем tips)
    else if (apiData.tips && Array.isArray(apiData.tips)) {
        apiData.tips.forEach(item => {
            const tip = parseSingleAPITip(item);
            if (tip) tips.push(tip);
        });
    }
    // Если это один объект
    else if (apiData.title || apiData.event) {
        const tip = parseSingleAPITip(apiData);
        if (tip) tips.push(tip);
    }
    
    return tips;
}

// ====== ПАРСИНГ ОДНОГО ПРОГНОЗА ИЗ API ======
function parseSingleAPITip(tipObj) {
    try {
        const tip = {};
        
        // 1. ДАТА ДОБАВЛЕНИЯ ПРОГНОЗА
        if (tipObj.dateAdded || tipObj.tipDate || tipObj.createdAt) {
            const dateStr = tipObj.dateAdded || tipObj.tipDate || tipObj.createdAt;
            tip.addedDate = formatAPIDate(dateStr);
        }
        
        // 2. ДАТА И ВРЕМЯ МАТЧА
        if (tipObj.matchDate || tipObj.eventDate || tipObj.fixtureDate) {
            const dateStr = tipObj.matchDate || tipObj.eventDate || tipObj.fixtureDate;
            tip.matchDateTime = formatAPIDate(dateStr);
        }
        
        // 3. НАЗВАНИЕ СОБЫТИЯ
        tip.event = tipObj.title || 
                   tipObj.event || 
                   tipObj.fixture || 
                   tipObj.match || 
                   'Неизвестное событие';
        
        // 4. ТИП РЫНКА И ПРОГНОЗ
        if (tipObj.tipBetItem && tipObj.tipBetItem.length > 0) {
            const betItem = tipObj.tipBetItem[0];
            tip.prediction = `${betItem.marketText || 'Прогноз'} • ${betItem.betText || ''}`;
        } else if (tipObj.market || tipObj.betType) {
            tip.prediction = `${tipObj.market || ''} • ${tipObj.betType || ''}`.trim();
        } else {
            tip.prediction = tipObj.prediction || 'Прогноз';
        }
        
        // 5. РЕКОМЕНДОВАННЫЙ КОЭФФИЦИЕНТ
        if (tipObj.odds || tipObj.finalOdds || tipObj.advisedOdds) {
            tip.advisedOdds = tipObj.odds || tipObj.finalOdds || tipObj.advisedOdds;
        } else if (tipObj.tipBetItem && tipObj.tipBetItem[0]) {
            tip.advisedOdds = tipObj.tipBetItem[0].finalOdds || tipObj.tipBetItem[0].createdOdds;
        }
        
        // 6. РАЗМЕР СТАВКИ
        if (tipObj.totalStake || tipObj.stake) {
            tip.stake = `£${tipObj.totalStake || tipObj.stake}`;
        } else if (tipObj.stakeAmount) {
            tip.stake = `£${tipObj.stakeAmount}`;
        }
        
        // 7. РЕЗУЛЬТАТ
        if (tipObj.result !== undefined) {
            // Предполагаем: 1 = win, 0 = loss, 2 = void
            if (tipObj.result === 1) {
                tip.result = 'won';
            } else if (tipObj.result === 0) {
                tip.result = 'lost';
            } else {
                tip.result = 'void';
            }
        } else if (tipObj.status) {
            tip.result = tipObj.status.toLowerCase();
        }
        
        // 8. ПРИБЫЛЬ
        if (tipObj.profit !== undefined && tipObj.profit !== null) {
            if (tipObj.profit > 0) {
                tip.profit = `+£${tipObj.profit.toFixed(2)}`;
            } else if (tipObj.profit < 0) {
                tip.profit = `-£${Math.abs(tipObj.profit).toFixed(2)}`;
            } else {
                tip.profit = '£0.00';
            }
        }
        
        // Дополнительно: ID для отладки
        tip._id = tipObj.id || tipObj._id || tipObj.reference;
        
        return tip;
        
    } catch (error) {
        console.error('❌ Ошибка парсинга объекта из API:', error, tipObj);
        return null;
    }
}

// ====== ФОРМАТИРОВАНИЕ ДАТЫ ИЗ API ======
function formatAPIDate(dateStr) {
    if (!dateStr) return '';
    
    try {
        // Если это timestamp
        if (typeof dateStr === 'number') {
            return new Date(dateStr).toISOString();
        }
        
        // Если это строка даты
        const date = new Date(dateStr);
        
        // Проверяем валидность
        if (isNaN(date.getTime())) {
            // Пробуем разные форматы
            const formats = [
                dateStr.replace('th ', ' ').replace('st ', ' ').replace('nd ', ' ').replace('rd ', ' '),
                dateStr.split('T')[0]
            ];
            
            for (const format of formats) {
                const testDate = new Date(format);
                if (!isNaN(testDate.getTime())) {
                    return testDate.toISOString();
                }
            }
            
            return dateStr; // Возвращаем как есть, если не удалось распарсить
        }
        
        return date.toISOString();
    } catch (error) {
        console.warn('⚠️ Ошибка форматирования даты:', dateStr, error);
        return dateStr;
    }
}

// ====== ОБНОВЛЕННАЯ ФУНКЦИЯ PARSE DATA ======
async function parseData() {
    const url = document.getElementById('url-input').value;
    const count = parseInt(document.getElementById('count-select').value);
    
    showLoading(true);
    
    try {
        console.log('🎯 Использую API метод...');
        
        // Извлекаем имя типстера из URL
        const tipsterMatch = url.match(/tipstrr\.com\/tipster\/([^\/]+)/);
        const tipsterName = tipsterMatch ? tipsterMatch[1] : 'freguli';
        
        // Получаем все прогнозы через API
        window.parsedData = await fetchAllTipsFromAPI(tipsterName, count);
        
        showResults();
        document.getElementById('export-btn').disabled = window.parsedData.length === 0;
        
        console.log(`✅ Найдено записей: ${window.parsedData.length}`);
        
        if (window.parsedData.length === 0) {
            alert('Через API не получено данных. Пробую HTML парсинг...');
            // Резервный метод: парсинг HTML
            await parseDataHTMLFallback();
        } else {
            alert(`Успешно! Получено ${window.parsedData.length} прогнозов через API.`);
        }
        
    } catch (error) {
        console.error('❌ Ошибка при работе с API:', error);
        alert('Ошибка API: ' + error.message + '\nПробую резервный метод...');
        await parseDataHTMLFallback();
    } finally {
        showLoading(false);
    }
}

// ====== РЕЗЕРВНЫЙ МЕТОД (HTML ПАРСИНГ) ======
async function parseDataHTMLFallback() {
    try {
        const url = document.getElementById('url-input').value;
        const count = parseInt(document.getElementById('count-select').value);
        
        console.log('🔄 Использую резервный HTML метод...');
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        
        const html = await response.text();
        
        // Используем улучшенный HTML парсер из предыдущего решения
        window.parsedData = parseTipsFromHTML(html).slice(0, count);
        
        if (window.parsedData.length === 0) {
            loadDemoData();
        }
    } catch (error) {
        console.error('❌ Ошибка в резервном методе:', error);
        loadDemoData();
    }
}

// ====== ТЕСТОВАЯ ФУНКЦИЯ ДЛЯ ПРОВЕРКИ API ======
async function testAPI() {
    console.clear();
    console.log('=== ТЕСТ API TIPSTRR ===');
    
    try {
        // Тест 1: Проверяем базовый запрос
        const testUrl = 'https://tipstrr.com/tipster/freguli/completed?skip=0&limit=5';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(testUrl)}`;
        
        const response = await fetch(proxyUrl);
        console.log('✅ Статус ответа:', response.status);
        
        const data = await response.json();
        console.log('📦 Полученные данные:', data);
        console.log('📊 Тип данных:', Array.isArray(data) ? 'Массив' : 'Объект');
        
        if (Array.isArray(data)) {
            console.log(`📈 Количество элементов: ${data.length}`);
            if (data.length > 0) {
                console.log('🔍 Структура первого элемента:', Object.keys(data[0]));
                console.log('📝 Пример данных:', JSON.stringify(data[0], null, 2).substring(0, 500) + '...');
            }
        } else {
            console.log('🔍 Ключи объекта:', Object.keys(data));
        }
        
        // Сохраняем для анализа
        window.apiTestData = data;
        
        // Парсим тестовые данные
        const parsed = parseAPITips(data);
        console.log(`🎯 Распарсено прогнозов: ${parsed.length}`);
        if (parsed.length > 0) {
            console.log('📋 Пример распарсенного:', parsed[0]);
        }
        
        alert(`Тест API завершен! Получено данных: ${Array.isArray(data) ? data.length : 'объект'}\nСмотрите консоль для деталей.`);
        
    } catch (error) {
        console.error('❌ Ошибка теста API:', error);
        alert('Ошибка теста API: ' + error.message);
    }
}

// ====== ДОБАВЬТЕ КНОПКУ ДЛЯ ТЕСТА API В HTML ======
// Вставьте эту кнопку в ваш index.html после кнопки "Тест":
// <button onclick="testAPI()" class="btn-small" style="background: #6f42c1;">
//     <i class="fas fa-satellite-dish"></i> Тест API
// </button>
