function parseHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const data = [];

    try {
        // 1. Ищем блоки с прогнозами на странице
        // Предполагаем, что каждый прогноз находится в блоке с классом "bg-white rounded-lg shadow-lg..."
        // Ищем статьи или блоки, которые выглядят как карточки прогнозов
        const feedCards = doc.querySelectorAll('article.flex.w-full.flex-col, [class*="feed-card"], .bg-white.rounded-lg.shadow-lg');

        // Если нашли такие блоки, парсим каждый
        if (feedCards.length > 0) {
            feedCards.forEach((card, index) => {
                try {
                    const tipData = parseTipCard(card);
                    if (tipData) {
                        data.push(tipData);
                    }
                } catch (error) {
                    console.warn(`Ошибка при парсинге карточки ${index}:`, error);
                }
            });
        } else {
            // 2. Альтернативный метод: парсим общую структуру страницы
            // Ваш пример показывает один конкретный прогноз, поэтому мы проанализируем его структуру
            const tipData = parseTipFromExample(doc);
            if (tipData) {
                data.push(tipData);
            }
        }

        // Если данных всё ещё нет, возвращаем демо-данные
        return data.length > 0 ? data : CONFIG.mockData;

    } catch (error) {
        console.error('Ошибка парсинга HTML:', error);
        return CONFIG.mockData;
    }
}

// Функция для парсинга карточки прогноза
function parseTipCard(cardElement) {
    // Извлекаем данные по селекторам, найденным в вашем HTML
    const tip = {};
    
    // 1. Дата и время события
    const dateElement = cardElement.querySelector('time');
    if (dateElement) {
        tip.date = dateElement.getAttribute('title') || dateElement.textContent.trim();
    }
    
    // 2. Название события (матча)
    const matchElement = cardElement.querySelector('a[href*="/fixture/"]');
    if (matchElement) {
        tip.event = matchElement.textContent.trim();
    }
    
    // 3. Тип прогноза (например, "Match winner • Al-Batin")
    const predictionElement = cardElement.querySelector('dt.text-xl.font-bold');
    if (predictionElement) {
        tip.prediction = predictionElement.textContent.trim();
    }
    
    // 4. Коэффициент
    const oddsElement = cardElement.querySelector('[data-odds]');
    if (oddsElement) {
        tip.odds = oddsElement.getAttribute('data-odds') || oddsElement.textContent.trim();
    }
    
    // 5. Результат ("won" или "lost")
    const resultElement = cardElement.querySelector('dl.bg-grey-light-3 dd');
    if (resultElement) {
        const resultText = resultElement.textContent.trim().toLowerCase();
        tip.result = resultText === 'won' ? '✅' : resultText === 'lost' ? '❌' : '➖';
    }
    
    // 6. Прибыль (Profit)
    const profitElement = cardElement.querySelector('profit');
    if (profitElement) {
        const profitText = profitElement.textContent.trim();
        tip.profit = profitText;
        
        // Определяем знак прибыли для стилей
        if (profitText.startsWith('-')) {
            tip.profitClass = 'profit-negative';
        } else if (profitText.startsWith('+')) {
            tip.profitClass = 'profit-positive';
        }
    }
    
    // 7. Дополнительно: ставка (stake)
    const stakeElement = cardElement.querySelector('stake');
    if (stakeElement) {
        tip.stake = stakeElement.textContent.replace('stake', '').trim();
    }
    
    // 8. Дополнительно: букмекер
    const bookmakerElement = cardElement.querySelector('a[href="/bookmaker-reviews"]');
    if (bookmakerElement) {
        tip.bookmaker = bookmakerElement.textContent.trim();
    }
    
    return tip;
}

// Функция для парсинга конкретного примера из вашего HTML
function parseTipFromExample(doc) {
    // Эти селекторы основаны на точной структуре из вашего примера
    const tip = {};
    
    // Дата и время из тега <time>
    const dateTime = doc.querySelector('time[title*="December"]');
    if (dateTime) {
        tip.date = dateTime.getAttribute('title');
    }
    
    // Название матча
    const matchLink = doc.querySelector('a[href*="/fixture/"]');
    if (matchLink) {
        tip.event = matchLink.textContent.trim();
    }
    
    // Тип прогноза и выбор
    const predictionHeader = doc.querySelector('dt.text-xl.font-bold');
    if (predictionHeader) {
        tip.prediction = predictionHeader.textContent
            .replace(/•/g, '·')
            .trim();
    }
    
    // Коэффициент (используем data-odds атрибут)
    const oddsSpan = doc.querySelector('span[data-odds]');
    if (oddsSpan) {
        tip.odds = oddsSpan.getAttribute('data-odds');
    }
    
    // Результат
    const resultText = doc.querySelector('dl.bg-grey-light-3 dd')?.textContent.trim();
    if (resultText) {
        tip.result = resultText.toLowerCase() === 'lost' ? '❌' : '✅';
    }
    
    // Прибыль
    const profitSpan = doc.querySelector('profit span');
    if (profitSpan) {
        tip.profit = profitSpan.textContent.trim();
    }
    
    // Если есть достаточные данные, возвращаем объект
    if (tip.event && tip.prediction) {
        // Форматируем дату, если нужно
        if (tip.date && tip.date.includes('December')) {
            // Преобразуем в формат "2023-12-19"
            const dateMatch = tip.date.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/);
            if (dateMatch) {
                const months = {
                    'December': '12', 'January': '01', 'February': '02',
                    'March': '03', 'April': '04', 'May': '05',
                    'June': '06', 'July': '07', 'August': '08',
                    'September': '09', 'October': '10', 'November': '11'
                };
                const day = dateMatch[1].padStart(2, '0');
                const month = months[dateMatch[2]] || '01';
                const year = dateMatch[3];
                tip.date = `${year}-${month}-${day}`;
            }
        }
        
        return tip;
    }
    
    return null;
}

// Обновляем функцию для загрузки реальных данных
async function fetchRealTipstrrData(url) {
    try {
        // Используем CORS прокси для обхода ограничений
        const proxyUrl = CONFIG.corsProxy + encodeURIComponent(url);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        const html = result.contents;
        
        // Парсим полученный HTML
        const parsedData = parseHTML(html);
        return parsedData;
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        throw error;
    }
}
