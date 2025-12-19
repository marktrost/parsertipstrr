require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cookie = require('cookie');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Конфигурация
const TIPSTRR_CONFIG = {
    baseUrl: 'https://tipstrr.com',
    loginUrl: 'https://tipstrr.com/login',
    resultsUrl: 'https://tipstrr.com/tipster/freguli/results',
    credentials: {
        email: process.env.TIPSTRR_EMAIL || 'kzgansta@gmail.com',
        password: process.env.TIPSTRR_PASSWORD || 'gmaMob8989bl!'
    }
};

// Глобальные переменные для сессии
let authCookies = null;
let lastLoginTime = 0;

// Функция для входа на tipstrr
async function loginToTipstrr() {
    try {
        console.log('🔐 Пытаюсь войти на Tipstrr...');
        
        // Сначала получаем CSRF токен
        const initialResponse = await axios.get(TIPSTRR_CONFIG.loginUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(initialResponse.data);
        const csrfToken = $('input[name="_token"]').val() || 
                         $('meta[name="csrf-token"]').attr('content');
        
        if (!csrfToken) {
            throw new Error('Не найден CSRF токен');
        }
        
        // Отправляем данные для входа
        const loginResponse = await axios.post(
            TIPSTRR_CONFIG.loginUrl,
            {
                email: TIPSTRR_CONFIG.credentials.email,
                password: TIPSTRR_CONFIG.credentials.password,
                _token: csrfToken,
                remember: 'on'
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://tipstrr.com',
                    'Referer': TIPSTRR_CONFIG.loginUrl
                },
                maxRedirects: 0,
                validateStatus: function (status) {
                    return status >= 200 && status < 303;
                }
            }
        );
        
        // Сохраняем куки
        if (loginResponse.headers['set-cookie']) {
            authCookies = loginResponse.headers['set-cookie'].map(c => cookie.parse(c));
            lastLoginTime = Date.now();
            console.log('✅ Успешный вход на Tipstrr');
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error.message);
        if (error.response) {
            console.error('Статус:', error.response.status);
            console.error('Данные:', error.response.data);
        }
        return false;
    }
}

// Функция для получения данных с авторизацией
async function fetchTipstrrData(url, count = 50) {
    try {
        // Проверяем, нужен ли новый логин (раз в 30 минут)
        const thirtyMinutes = 30 * 60 * 1000;
        if (!authCookies || Date.now() - lastLoginTime > thirtyMinutes) {
            const loggedIn = await loginToTipstrr();
            if (!loggedIn) {
                throw new Error('Не удалось войти на Tipstrr');
            }
        }
        
        // Формируем куки для запроса
        const cookieString = authCookies
            .map(c => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '))
            .join('; ');
        
        // Загружаем страницу с прогнозами
        console.log(`📥 Загружаю данные: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'Cookie': cookieString,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        
        // Парсим HTML
        const data = parseTipstrrHTML(response.data, count);
        console.log(`✅ Получено ${data.length} прогнозов`);
        
        return data;
        
    } catch (error) {
        console.error('❌ Ошибка получения данных:', error.message);
        
        // Пытаемся перелогиниться и повторить
        if (error.response && error.response.status === 401) {
            console.log('🔄 Сессия истекла, пытаюсь перелогиниться...');
            authCookies = null;
            return fetchTipstrrData(url, count);
        }
        
        throw error;
    }
}

// Парсинг HTML с прогнозами
function parseTipstrrHTML(html, limit = 50) {
    const $ = cheerio.load(html);
    const tips = [];
    
    console.log('🔍 Начинаю парсинг HTML...');
    
    // Ищем карточки прогнозов
    $('article.flex.w-full.flex-col, [data-island*="FeedCard"], .bg-white.rounded-lg').each((i, element) => {
        if (tips.length >= limit) return false; // Ограничиваем количество
        
        try {
            const tip = parseTipElement($, $(element));
            if (tip && tip.event && !tip.event.includes('Unlock this free')) {
                tips.push(tip);
            }
        } catch (error) {
            console.warn(`Ошибка парсинга карточки ${i}:`, error.message);
        }
    });
    
    // Если не нашли через стандартные селекторы, ищем по структуре
    if (tips.length === 0) {
        console.log('🔄 Использую альтернативные селекторы...');
        
        $('div').each((i, element) => {
            if (tips.length >= limit) return false;
            
            const $el = $(element);
            const text = $el.text();
            
            // Ищем блоки, которые выглядят как прогнозы
            if (text.includes('v') && (text.includes('odds') || text.includes('stake'))) {
                const tip = extractTipFromText(text);
                if (tip) tips.push(tip);
            }
        });
    }
    
    console.log(`🎯 Найдено прогнозов: ${tips.length}`);
    return tips;
}

// Парсим элемент с прогнозом
function parseTipElement($, $element) {
    const tip = {};
    
    // 1. Дата и время
    const timeElement = $element.find('time');
    if (timeElement.length) {
        tip.date = timeElement.attr('title') || timeElement.text().trim();
        // Форматируем дату
        tip.date = formatDate(tip.date);
    }
    
    // 2. Событие (матч)
    const eventLink = $element.find('a[href*="/fixture/"]');
    if (eventLink.length) {
        tip.event = eventLink.text().trim();
    }
    
    // 3. Прогноз
    const predictionElement = $element.find('dt.text-xl.font-bold');
    if (predictionElement.length) {
        tip.prediction = predictionElement.text().trim();
    }
    
    // 4. Коэффициент
    const oddsElement = $element.find('[data-odds]');
    if (oddsElement.length) {
        tip.odds = oddsElement.attr('data-odds') || oddsElement.text().trim();
    }
    
    // 5. Результат
    const resultElement = $element.find('dl.bg-grey-light-3 dd');
    if (resultElement.length) {
        const resultText = resultElement.text().trim().toLowerCase();
        tip.result = resultText === 'won' ? '✅' : 
                     resultText === 'lost' ? '❌' : '➖';
    }
    
    // 6. Прибыль
    const profitElement = $element.find('profit');
    if (profitElement.length) {
        const profitText = profitElement.text().trim();
        tip.profit = profitText;
        tip.profitClass = profitText.startsWith('-') ? 'profit-negative' : 
                         profitText.startsWith('+') ? 'profit-positive' : '';
    }
    
    // 7. Ставка
    const stakeElement = $element.find('stake');
    if (stakeElement.length) {
        tip.stake = stakeElement.text().replace('stake', '').trim();
    }
    
    return tip;
}

// Извлекаем данные из текста (резервный метод)
function extractTipFromText(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const tip = {};
    
    lines.forEach(line => {
        const cleanLine = line.trim();
        
        // Дата
        if (cleanLine.match(/\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}/)) {
            tip.date = formatDate(cleanLine);
        }
        
        // Матч (формат "Team A v Team B")
        if (cleanLine.match(/[A-Za-z\s]+v[A-Za-z\s]+/i) && cleanLine.length < 100) {
            tip.event = cleanLine;
        }
        
        // Коэффициент
        const oddsMatch = cleanLine.match(/odds?\s*([\d.]+)/i) || cleanLine.match(/(\d+\.\d+)/);
        if (oddsMatch && !tip.odds) {
            tip.odds = oddsMatch[1];
        }
        
        // Прибыль
        const profitMatch = cleanLine.match(/[+-]£?\d+(?:\.\d+)?/);
        if (profitMatch && !tip.profit) {
            tip.profit = profitMatch[0];
            tip.profitClass = tip.profit.startsWith('-') ? 'profit-negative' : 'profit-positive';
        }
        
        // Результат
        if (cleanLine.toLowerCase().includes('won') && !tip.result) {
            tip.result = '✅';
        }
        if (cleanLine.toLowerCase().includes('lost') && !tip.result) {
            tip.result = '❌';
        }
    });
    
    return tip.event ? tip : null;
}

// Форматирование даты
function formatDate(dateString) {
    if (!dateString) return '';
    
    const months = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    
    try {
        // Формат "19th December 2025 at 15:20"
        const match = dateString.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = months[match[2]] || '01';
            const year = match[3];
            return `${year}-${month}-${day}`;
        }
        
        // Формат "2025-12-19"
        const isoMatch = dateString.match(/(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) return isoMatch[1];
        
    } catch (e) {
        // Игнорируем ошибки парсинга
    }
    
    return dateString;
}

// API маршруты
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Получить прогнозы
app.get('/api/tips', async (req, res) => {
    try {
        const { count = 50, page = 1 } = req.query;
        const url = TIPSTRR_CONFIG.resultsUrl;
        
        console.log(`📊 Запрос прогнозов: ${count} штук, страница ${page}`);
        
        const tips = await fetchTipstrrData(url, parseInt(count));
        
        // Пагинация
        const startIndex = (page - 1) * count;
        const endIndex = startIndex + parseInt(count);
        const paginatedTips = tips.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            count: paginatedTips.length,
            total: tips.length,
            page: parseInt(page),
            totalPages: Math.ceil(tips.length / count),
            tips: paginatedTips
        });
        
    } catch (error) {
        console.error('❌ Ошибка API:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Не удалось получить данные'
        });
    }
});

// Получить статистику
app.get('/api/stats', async (req, res) => {
    try {
        const tips = await fetchTipstrrData(TIPSTRR_CONFIG.resultsUrl, 100);
        
        const stats = {
            total: tips.length,
            won: tips.filter(t => t.result === '✅').length,
            lost: tips.filter(t => t.result === '❌').length,
            pending: tips.filter(t => !t.result || t.result === '➖').length,
            totalProfit: tips.reduce((sum, t) => {
                if (t.profit) {
                    const num = parseFloat(t.profit.replace(/[^0-9.-]+/g, '')) || 0;
                    return sum + num;
                }
                return sum;
            }, 0)
        };
        
        res.json({
            success: true,
            stats,
            lastUpdated: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🔗 Адрес: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/tips`);
});
