require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cookie = require('cookie');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// Безопасность и Middleware
// =====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));
app.use(compression());
app.use(cors({
    origin: function(origin, callback) {
        // Разрешаем все origins в разработке
        if (!origin || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        // На продакшене разрешаем конкретные домены
        const allowedOrigins = [
            'https://tipstrr-parser.onrender.com',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            /\.onrender\.com$/
        ];
        
        if (allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') return origin === allowed;
            if (allowed instanceof RegExp) return allowed.test(origin);
            return false;
        })) {
            return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// Конфигурация
// =====================
const TIPSTRR_CONFIG = {
    baseUrl: 'https://tipstrr.com',
    loginUrl: 'https://tipstrr.com/login',
    resultsUrl: 'https://tipstrr.com/tipster/freguli/results',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
};

// =====================
// Глобальные переменные
// =====================
let authSession = {
    cookies: null,
    csrfToken: null,
    lastLogin: 0,
    isLoggedIn: false
};

let cachedData = {
    tips: [],
    timestamp: 0,
    ttl: 5 * 60 * 1000 // 5 минут кэш
};

// =====================
// Функции авторизации
// =====================
async function getCsrfToken() {
    try {
        console.log('🔐 Получаю CSRF токен...');
        const response = await axios.get(TIPSTRR_CONFIG.loginUrl, {
            headers: TIPSTRR_CONFIG.headers,
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        let csrfToken = $('meta[name="csrf-token"]').attr('content') ||
                       $('input[name="_token"]').val() ||
                       $('input[name="csrf_token"]').val();
        
        if (!csrfToken) {
            // Пробуем найти в скриптах
            const scriptContent = $('script').text();
            const match = scriptContent.match(/csrfToken.*?"([^"]+)"/);
            if (match) csrfToken = match[1];
        }
        
        console.log(csrfToken ? '✅ CSRF токен найден' : '❌ CSRF токен не найден');
        return csrfToken;
        
    } catch (error) {
        console.error('❌ Ошибка получения CSRF:', error.message);
        return null;
    }
}

async function loginToTipstrr() {
    try {
        console.log('🔐 Начинаю процедуру входа на Tipstrr...');
        
        const csrfToken = await getCsrfToken();
        if (!csrfToken) {
            throw new Error('Не удалось получить CSRF токен');
        }
        
        // Подготовка данных для входа
        const formData = new URLSearchParams();
        formData.append('email', process.env.TIPSTRR_EMAIL || 'kzgansta@gmail.com');
        formData.append('password', process.env.TIPSTRR_PASSWORD || 'gmaMob8989bl!');
        formData.append('_token', csrfToken);
        formData.append('remember', 'on');
        
        console.log('📤 Отправляю запрос на вход...');
        
        const response = await axios.post(TIPSTRR_CONFIG.loginUrl, formData, {
            headers: {
                ...TIPSTRR_CONFIG.headers,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': TIPSTRR_CONFIG.baseUrl,
                'Referer': TIPSTRR_CONFIG.loginUrl,
                'X-CSRF-TOKEN': csrfToken
            },
            maxRedirects: 0,
            validateStatus: function(status) {
                return status >= 300 && status < 303; // Ожидаем редирект при успешном входе
            },
            timeout: 15000
        });
        
        console.log('📥 Ответ от сервера:', response.status);
        
        // Проверяем куки
        if (response.headers['set-cookie']) {
            const cookiesArray = response.headers['set-cookie'];
            authSession.cookies = cookiesArray.map(c => {
                const parsed = cookie.parse(c);
                return Object.entries(parsed)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('; ');
            }).join('; ');
            
            authSession.csrfToken = csrfToken;
            authSession.lastLogin = Date.now();
            authSession.isLoggedIn = true;
            
            console.log('✅ Успешный вход! Куки сохранены.');
            console.log('📊 Длина кук:', authSession.cookies.length);
            
            // Тестовый запрос для проверки
            await testAuthSession();
            
            return true;
        }
        
        throw new Error('Куки не получены');
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error.message);
        if (error.response) {
            console.error('Статус:', error.response.status);
            console.error('Заголовки:', error.response.headers);
        }
        authSession.isLoggedIn = false;
        return false;
    }
}

async function testAuthSession() {
    try {
        console.log('🧪 Тестирую авторизованную сессию...');
        
        const testResponse = await axios.get(TIPSTRR_CONFIG.resultsUrl, {
            headers: {
                ...TIPSTRR_CONFIG.headers,
                'Cookie': authSession.cookies
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(testResponse.data);
        const pageTitle = $('title').text();
        const isLoggedIn = !pageTitle.includes('Login') && 
                          !testResponse.data.includes('Sign in to your account');
        
        console.log(isLoggedIn ? '✅ Сессия активна' : '❌ Сессия не активна');
        console.log('📄 Заголовок страницы:', pageTitle);
        
        return isLoggedIn;
        
    } catch (error) {
        console.error('❌ Ошибка тестирования сессии:', error.message);
        return false;
    }
}

// =====================
// Функции парсинга
// =====================
async function ensureAuth() {
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут
    
    if (!authSession.isLoggedIn || 
        Date.now() - authSession.lastLogin > SESSION_TIMEOUT) {
        console.log('🔄 Сессия устарела или отсутствует, логинимся...');
        const success = await loginToTipstrr();
        if (!success) {
            throw new Error('Не удалось войти в аккаунт Tipstrr');
        }
    }
    
    return true;
}

async function fetchTipstrrData(count = 50) {
    try {
        await ensureAuth();
        
        console.log(`📥 Загружаю страницу результатов...`);
        
        const response = await axios.get(TIPSTRR_CONFIG.resultsUrl, {
            headers: {
                ...TIPSTRR_CONFIG.headers,
                'Cookie': authSession.cookies,
                'Referer': TIPSTRR_CONFIG.baseUrl
            },
            timeout: 20000
        });
        
        console.log(`✅ Страница загружена, размер: ${response.data.length} байт`);
        
        // Сохраняем HTML для отладки
        if (process.env.NODE_ENV !== 'production') {
            fs.writeFileSync('debug_page.html', response.data);
            console.log('💾 HTML сохранен в debug_page.html');
        }
        
        const tips = parseHTML(response.data, count);
        console.log(`🎯 Распарсено ${tips.length} прогнозов`);
        
        // Кэшируем данные
        cachedData.tips = tips;
        cachedData.timestamp = Date.now();
        
        return tips;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error.message);
        
        if (error.response) {
            console.error('Статус:', error.response.status);
            
            // Если 401 или 403 - пробуем перелогиниться
            if ([401, 403].includes(error.response.status)) {
                console.log('🔄 Обнаружена ошибка авторизации, пробую перелогиниться...');
                authSession.isLoggedIn = false;
                return fetchTipstrrData(count);
            }
        }
        
        throw error;
    }
}

function parseHTML(html, limit) {
    const $ = cheerio.load(html);
    const tips = [];
    
    console.log('🔍 Начинаю парсинг HTML...');
    
    // Селекторы для разных версий сайта
    const selectors = [
        'article', // Основные карточки
        '[class*="card"]', // Карточки
        '.bg-white.rounded-lg', // Белые карточки с закруглениями
        '[data-testid*="tip"]', // По data-атрибутам
        '.flex.flex-col', // Flex контейнеры
        '.border.rounded', // Элементы с рамкой
        'div[class*="result"]' // Результаты
    ];
    
    // Пробуем все селекторы
    for (const selector of selectors) {
        const elements = $(selector);
        console.log(`🔎 Селектор "${selector}": найдено ${elements.length} элементов`);
        
        if (elements.length > 0) {
            elements.each((i, element) => {
                if (tips.length >= limit) return false;
                
                try {
                    const tip = parseTipElement($, $(element));
                    if (tip && tip.event && isValidTip(tip)) {
                        tips.push(tip);
                    }
                } catch (err) {
                    console.warn(`Ошибка парсинга элемента ${i}:`, err.message);
                }
            });
            
            if (tips.length > 0) break;
        }
    }
    
    // Если ничего не нашли, используем резервный метод
    if (tips.length === 0) {
        console.log('🔄 Использую резервный метод парсинга...');
        const fallbackTips = parseByTextPattern($, html, limit);
        tips.push(...fallbackTips);
    }
    
    return tips;
}

function parseTipElement($, $element) {
    const tip = {};
    
    // 1. Извлекаем текст всего элемента
    const fullText = $element.text().replace(/\s+/g, ' ').trim();
    
    // 2. Дата и время
    const timeElement = $element.find('time');
    if (timeElement.length) {
        tip.date = timeElement.attr('datetime') || 
                  timeElement.attr('title') || 
                  timeElement.text().trim();
    } else {
        // Ищем дату в тексте
        const dateMatch = fullText.match(/\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}/) ||
                         fullText.match(/\d{4}-\d{2}-\d{2}/) ||
                         fullText.match(/\d{2}\/\d{2}\/\d{4}/);
        if (dateMatch) tip.date = dateMatch[0];
    }
    
    // 3. Матч (событие)
    const eventElements = $element.find('a[href*="/fixture/"], [class*="event"], [class*="match"]');
    if (eventElements.length) {
        tip.event = eventElements.first().text().trim();
    } else {
        // Ищем паттерн "Team A v Team B"
        const eventMatch = fullText.match(/([A-Z][A-Za-z0-9\s.-]+?)\s+v(?:s|\.)?\s+([A-Z][A-Za-z0-9\s.-]+)/);
        if (eventMatch) {
            tip.event = `${eventMatch[1]} v ${eventMatch[2]}`;
        }
    }
    
    // 4. Прогноз
    const predictionElements = $element.find('[class*="prediction"], [class*="tip"], [class*="pick"]');
    if (predictionElements.length) {
        tip.prediction = predictionElements.first().text().trim();
    } else if (fullText.includes('Match winner')) {
        const match = fullText.match(/Match winner • ([A-Za-z0-9\s.-]+)/);
        tip.prediction = match ? `Match winner • ${match[1]}` : 'Match winner';
    }
    
    // 5. Коэффициент
    const oddsElements = $element.find('[data-odds], [class*="odds"], [class*="coefficient"]');
    if (oddsElements.length) {
        tip.odds = oddsElements.first().attr('data-odds') || oddsElements.first().text().trim();
    } else {
        const oddsMatch = fullText.match(/\b\d+\.\d{2}\b/);
        if (oddsMatch) tip.odds = oddsMatch[0];
    }
    
    // 6. Ставка
    const stakeMatch = fullText.match(/£(\d+(?:\.\d{2})?)\s*stake/i) ||
                      fullText.match(/stake.*?£(\d+(?:\.\d{2})?)/i);
    if (stakeMatch) {
        tip.stake = `£${stakeMatch[1]}`;
    } else {
        tip.stake = '£10'; // Значение по умолчанию
    }
    
    // 7. Результат
    if (fullText.toLowerCase().includes('won')) {
        tip.result = 'won';
        tip.resultEmoji = '✅';
    } else if (fullText.toLowerCase().includes('lost')) {
        tip.result = 'lost';
        tip.resultEmoji = '❌';
    } else {
        tip.result = 'pending';
        tip.resultEmoji = '➖';
    }
    
    // 8. Прибыль
    const profitMatch = fullText.match(/[+-]£\d+(?:\.\d{2})?/) ||
                       fullText.match(/profit.*?([+-]\d+(?:\.\d{2})?)/i);
    if (profitMatch) {
        tip.profit = profitMatch[0].includes('£') ? profitMatch[0] : `£${profitMatch[1]}`;
    }
    
    // 9. Лига/Турнир
    const leagueElements = $element.find('[class*="league"], [class*="tournament"]');
    if (leagueElements.length) {
        tip.league = leagueElements.first().text().trim();
    }
    
    // 10. Дополнительная информация
    tip.timestamp = new Date().toISOString();
    tip.source = 'tipstrr.com';
    
    return tip;
}

function parseByTextPattern($, html, limit) {
    const tips = [];
    
    // Разбиваем HTML на строки и ищем паттерны
    const lines = html.split('\n');
    
    for (const line of lines) {
        if (tips.length >= limit) break;
        
        const cleanLine = line.trim();
        if (cleanLine.length < 20 || cleanLine.length > 500) continue;
        
        // Проверяем, похожа ли строка на прогноз
        if (cleanLine.includes('v') && 
            (cleanLine.includes('Match winner') || cleanLine.includes('odds'))) {
            
            const tip = {};
            
            // Извлекаем данные
            const eventMatch = cleanLine.match(/([A-Z][A-Za-z0-9\s.-]+?)\s+v(?:s|\.)?\s+([A-Z][A-Za-z0-9\s.-]+)/);
            if (eventMatch) tip.event = `${eventMatch[1]} v ${eventMatch[2]}`;
            
            const oddsMatch = cleanLine.match(/\b\d+\.\d{2}\b/);
            if (oddsMatch) tip.odds = oddsMatch[0];
            
            const profitMatch = cleanLine.match(/[+-]£\d+(?:\.\d{2})?/);
            if (profitMatch) tip.profit = profitMatch[0];
            
            if (cleanLine.includes('won')) tip.result = 'won';
            if (cleanLine.includes('lost')) tip.result = 'lost';
            
            if (tip.event) {
                tip.timestamp = new Date().toISOString();
                tip.stake = '£10';
                tip.prediction = 'Match winner';
                tips.push(tip);
            }
        }
    }
    
    return tips;
}

function isValidTip(tip) {
    return tip.event && 
           tip.event.length > 5 && 
           !tip.event.includes('Unlock') && 
           !tip.event.includes('Sign up') &&
           tip.event.includes('v');
}

// =====================
// Вспомогательные функции
// =====================
function formatDate(dateString) {
    if (!dateString) return new Date().toISOString().split('T')[0];
    
    try {
        // Пробуем разные форматы
        const formats = [
            // "19 December 2025 at 15:20"
            /(\d{1,2})\s+(\w+)\s+(\d{4})/,
            // "2025-12-19"
            /(\d{4})-(\d{2})-(\d{2})/,
            // "19/12/2025"
            /(\d{2})\/(\d{2})\/(\d{4})/
        ];
        
        for (const format of formats) {
            const match = dateString.match(format);
            if (match) {
                if (format === formats[0]) {
                    const months = {
                        'January': '01', 'February': '02', 'March': '03',
                        'April': '04', 'May': '05', 'June': '06',
                        'July': '07', 'August': '08', 'September': '09',
                        'October': '10', 'November': '11', 'December': '12'
                    };
                    const day = match[1].padStart(2, '0');
                    const month = months[match[2]] || '01';
                    const year = match[3];
                    return `${year}-${month}-${day}`;
                } else if (format === formats[1]) {
                    return match[0];
                } else if (format === formats[2]) {
                    return `${match[3]}-${match[2]}-${match[1]}`;
                }
            }
        }
        
        // Если не распарсилось, возвращаем как есть
        return dateString;
        
    } catch (error) {
        return dateString;
    }
}

// =====================
// Статические файлы
// =====================
app.use(express.static(path.join(__dirname, 'public')));

// =====================
// API маршруты
// =====================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        render: true,
        session: {
            isLoggedIn: authSession.isLoggedIn,
            lastLogin: authSession.lastLogin ? new Date(authSession.lastLogin).toISOString() : null
        }
    });
});

app.get('/api/tips', async (req, res) => {
    try {
        const { count = 50, page = 1, force = false } = req.query;
        const parsedCount = Math.min(parseInt(count), 100);
        const parsedPage = parseInt(page) || 1;
        
        console.log(`📊 API запрос: count=${parsedCount}, page=${parsedPage}, force=${force}`);
        
        // Проверяем кэш
        const useCache = !force && 
                        cachedData.tips.length > 0 && 
                        Date.now() - cachedData.timestamp < cachedData.ttl;
        
        let tips;
        if (useCache) {
            console.log('💾 Использую кэшированные данные');
            tips = cachedData.tips;
        } else {
            tips = await fetchTipstrrData(parsedCount);
        }
        
        // Пагинация
        const startIndex = (parsedPage - 1) * parsedCount;
        const endIndex = startIndex + parsedCount;
        const paginatedTips = tips.slice(startIndex, endIndex);
        
        // Форматируем для фронтенда
        const formattedTips = paginatedTips.map(tip => ({
            addedDate: formatDate(tip.date || tip.timestamp),
            matchDateTime: formatDate(tip.date),
            event: tip.event || 'Не указано',
            prediction: tip.prediction || 'Match winner',
            advisedOdds: tip.odds || '-',
            stake: tip.stake || '£10',
            result: tip.result || 'pending',
            profit: tip.profit || '-',
            league: tip.league || '',
            resultEmoji: tip.resultEmoji || '➖',
            source: tip.source || 'tipstrr.com'
        }));
        
        res.json({
            success: true,
            count: formattedTips.length,
            total: tips.length,
            page: parsedPage,
            totalPages: Math.ceil(tips.length / parsedCount),
            cached: useCache,
            cacheAge: useCache ? Date.now() - cachedData.timestamp : 0,
            tips: formattedTips
        });
        
    } catch (error) {
        console.error('❌ API ошибка:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Не удалось получить данные с Tipstrr',
            tips: getDemoData() // Возвращаем демо-данные при ошибке
        });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const tips = await fetchTipstrrData(100);
        
        const stats = {
            total: tips.length,
            won: tips.filter(t => t.result === 'won').length,
            lost: tips.filter(t => t.result === 'lost').length,
            pending: tips.filter(t => !t.result || t.result === 'pending').length,
            totalProfit: tips.reduce((sum, t) => {
                if (t.profit) {
                    const num = parseFloat(t.profit.replace(/[^0-9.-]+/g, '')) || 0;
                    return sum + num;
                }
                return sum;
            }, 0).toFixed(2),
            winRate: tips.length > 0 ? 
                ((tips.filter(t => t.result === 'won').length / tips.length) * 100).toFixed(1) : 0,
            averageOdds: tips.length > 0 ? 
                (tips.reduce((sum, t) => sum + (parseFloat(t.odds) || 0), 0) / tips.length).toFixed(2) : 0
        };
        
        res.json({
            success: true,
            stats,
            session: {
                isLoggedIn: authSession.isLoggedIn,
                lastLogin: new Date(authSession.lastLogin).toLocaleString('ru-RU')
            },
            lastUpdated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Ошибка статистики:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/debug', async (req, res) => {
    try {
        const authStatus = await testAuthSession();
        
        res.json({
            session: {
                isLoggedIn: authSession.isLoggedIn,
                hasCookies: !!authSession.cookies,
                cookiesLength: authSession.cookies ? authSession.cookies.length : 0,
                csrfToken: authSession.csrfToken ? 'Присутствует' : 'Отсутствует',
                lastLogin: authSession.lastLogin ? new Date(authSession.lastLogin).toLocaleString('ru-RU') : 'Никогда',
                authStatus: authStatus ? 'Активна' : 'Не активна'
            },
            cache: {
                hasData: cachedData.tips.length > 0,
                count: cachedData.tips.length,
                age: cachedData.timestamp ? Date.now() - cachedData.timestamp : 0,
                ttl: cachedData.ttl
            },
            environment: {
                node: process.version,
                env: process.env.NODE_ENV || 'development',
                hasEmail: !!process.env.TIPSTRR_EMAIL,
                hasPassword: !!process.env.TIPSTRR_PASSWORD,
                port: PORT
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Демо-данные на случай ошибок
function getDemoData() {
    return [
        {
            addedDate: '2025-12-19',
            matchDateTime: '2025-12-19',
            event: 'Walthamstow v Stanway Rovers',
            prediction: 'Match winner • Stanway Rovers',
            advisedOdds: '2.06',
            stake: '£10',
            result: 'won',
            profit: '+£10.60',
            league: 'England Isthmian Division One North'
        },
        {
            addedDate: '2025-12-18',
            matchDateTime: '2025-12-18',
            event: 'Vaduz v FC Aarau',
            prediction: 'Match winner • Vaduz',
            advisedOdds: '2.26',
            stake: '£10',
            result: 'won',
            profit: '+£12.60',
            league: 'Switzerland Challenge League'
        }
    ];
}

// =====================
// Главные маршруты
// =====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-render-secret'] !== process.env.RENDER_SECRET) {
        return res.status(403).send('Access denied');
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Tipstrr Parser Admin</title></head>
        <body>
            <h1>Tipstrr Parser Admin</h1>
            <p>Status: ${authSession.isLoggedIn ? '✅ Logged in' : '❌ Not logged in'}</p>
            <button onclick="fetch('/api/debug').then(r => r.json()).then(console.log)">Debug Info</button>
            <button onclick="fetch('/api/tips?count=5').then(r => r.json()).then(console.log)">Test API</button>
            <button onclick="fetch('/api/tips?force=true').then(r => r.json()).then(console.log)">Force Refresh</button>
        </body>
        </html>
    `);
});

// 404 обработчик
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.path} not found`,
        availableRoutes: ['/api/health', '/api/tips', '/api/stats', '/api/debug']
    });
});

// =====================
// Запуск сервера
// =====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 Tipstrr Parser Server запущен!
    🔗 Локальный: http://localhost:${PORT}
    🌐 Сеть: 0.0.0.0:${PORT}
    📊 API: http://localhost:${PORT}/api/health
    📁 Статика: http://localhost:${PORT}/
    
    ⚙️  Конфигурация:
    - NODE_ENV: ${process.env.NODE_ENV || 'development'}
    - Email: ${process.env.TIPSTRR_EMAIL ? 'Установлен' : 'Не установлен'}
    - Render.com: ✅ Готово к деплою
    
    📋 Следующие шаги:
    1. Запусти сервер локально: npm start
    2. Проверь: http://localhost:${PORT}/api/health
    3. Залий на GitHub
    4. Деплой на Render.com
    `);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('⚠️  Необработанное исключение:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  Необработанный промис:', reason);
});
