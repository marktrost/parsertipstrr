// Tipstrr Parser Client для Render.com
let parsedData = [];
let serverBaseUrl = '';

// Определяем URL сервера автоматически
function detectServerUrl() {
    const currentUrl = window.location.origin;
    
    // Если мы на Render, используем текущий домен
    if (currentUrl.includes('render.com') || currentUrl.includes('localhost')) {
        serverBaseUrl = currentUrl;
    } else {
        // Вне Render - используем твой Render URL
        serverBaseUrl = 'https://твой-проект.onrender.com';
    }
    
    console.log('🌐 Сервер определен:', serverBaseUrl);
    return serverBaseUrl;
}

// Инициализация
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 Tipstrr Parser загружен');
    
    serverBaseUrl = detectServerUrl();
    
    // Проверяем статус сервера
    await checkServerStatus();
    
    // Назначаем обработчики
    document.getElementById('parse-btn').addEventListener('click', fetchRealData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
    document.getElementById('debug-btn').addEventListener('click', checkServerStatus);
    document.getElementById('stats-btn').addEventListener('click', showStats);
    document.getElementById('force-btn').addEventListener('click', () => fetchRealData(true));
    
    console.log('✅ Парсер готов к работе');
});

// Проверка статуса сервера
async function checkServerStatus() {
    try {
        showStatus('Сервер: проверка...', 'status-offline');
        
        const response = await fetch(`${serverBaseUrl}/api/health`, {
            timeout: 5000
        }).catch(err => {
            throw new Error('Сервер не отвечает');
        });
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            showStatus('Сервер: онлайн', 'status-online');
            document.getElementById('server-status-text').textContent = '✅ Онлайн';
            document.getElementById('server-time').textContent = new Date(data.timestamp).toLocaleString('ru-RU');
            document.getElementById('server-mode').textContent = data.environment || 'development';
            document.getElementById('server-info').style.display = 'block';
            
            // Проверяем авторизацию
            checkAuthStatus();
            
            return true;
        } else {
            throw new Error('Неверный ответ сервера');
        }
        
    } catch (error) {
        console.error('❌ Ошибка подключения к серверу:', error);
        showStatus('Сервер: офлайн', 'status-offline');
        document.getElementById('server-status-text').textContent = '❌ Офлайн';
        document.getElementById('server-time').textContent = '-';
        document.getElementById('server-info').style.display = 'block';
        
        alert(`Ошибка подключения к серверу: ${error.message}\n\nУбедитесь, что:\n1. Сервер запущен на Render.com\n2. Установлены переменные окружения\n3. Сервер доступен по адресу: ${serverBaseUrl}`);
        
        return false;
    }
}

// Проверка авторизации
async function checkAuthStatus() {
    try {
        const response = await fetch(`${serverBaseUrl}/api/debug`);
        const data = await response.json();
        
        const authStatus = document.getElementById('auth-status');
        if (data.session.isLoggedIn) {
            authStatus.innerHTML = '<span style="color: green;">✅ Авторизован на Tipstrr</span>';
        } else {
            authStatus.innerHTML = '<span style="color: red;">❌ Не авторизован</span>';
        }
        
        document.getElementById('last-update').textContent = 
            new Date(data.timestamp).toLocaleString('ru-RU');
            
    } catch (error) {
        console.warn('Не удалось проверить авторизацию:', error);
    }
}

// Получение реальных данных
async function fetchRealData(forceRefresh = false) {
    showLoading(true);
    
    try {
        const count = document.getElementById('count-select').value;
        const url = `${serverBaseUrl}/api/tips?count=${count}${forceRefresh ? '&force=true' : ''}`;
        
        console.log(`🚀 Запрос данных: ${url}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            parsedData = result.tips;
            
            // Показываем информацию о кэше
            const cacheInfo = document.getElementById('cache-info');
            if (result.cached) {
                cacheInfo.style.display = 'inline';
                cacheInfo.title = `Данные из кэша (возраст: ${Math.round(result.cacheAge / 1000)} сек)`;
            } else {
                cacheInfo.style.display = 'none';
            }
            
            if (parsedData.length > 0) {
                showResults();
                document.getElementById('export-btn').disabled = false;
                
                // Обновляем статус
                document.getElementById('last-update').textContent = new Date().toLocaleString('ru-RU');
                
                // Показываем уведомление
                showNotification(`✅ Получено ${parsedData.length} реальных прогнозов${result.cached ? ' (из кэша)' : ''}`);
                
            } else {
                showNotification('⚠️ Сервер вернул пустой список прогнозов');
            }
            
        } else {
            throw new Error(result.message || 'Неизвестная ошибка сервера');
        }
        
    } catch (error) {
        console.error('❌ Ошибка получения данных:', error);
        showNotification(`❌ Ошибка: ${error.message}`);
        
        // Показываем демо-данные при ошибке
        if (parsedData.length === 0) {
            showDemoData();
        }
        
    } finally {
        showLoading(false);
    }
}

// Показать статистику
async function showStats() {
    try {
        const response = await fetch(`${serverBaseUrl}/api/stats`);
        const result = await response.json();
        
        if (result.success) {
            const stats = result.stats;
            const message = `
📊 Статистика Tipstrr:

Всего прогнозов: ${stats.total}
✅ Выиграно: ${stats.won}
❌ Проиграно: ${stats.lost}
➖ В ожидании: ${stats.pending}

Процент выигрыша: ${stats.winRate}%
Средний коэффициент: ${stats.averageOdds}
Общая прибыль: £${stats.totalProfit}

Последнее обновление: ${new Date(result.lastUpdated).toLocaleString('ru-RU')}
            `.trim();
            
            alert(message);
        }
    } catch (error) {
        alert('Ошибка получения статистики: ' + error.message);
    }
}

// Отображение результатов
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (!parsedData.length) {
        tbody.innerHTML = '<tr><td colspan="8">Нет данных для отображения</td></tr>';
        countSpan.textContent = '0';
        return;
    }
    
    let html = '';
    parsedData.forEach(item => {
        const resultClass = item.result === 'won' ? 'success' : 
                          item.result === 'lost' ? 'error' : '';
        
        const profitClass = (item.profit || '').startsWith('+') ? 'success' : 
                          (item.profit || '').startsWith('-') ? 'error' : '';
        
        html += `<tr>
            <td>${formatDate(item.addedDate)}</td>
            <td><strong>${item.event || '-'}</strong></td>
            <td>${item.prediction || '-'}</td>
            <td>${item.advisedOdds || '-'}</td>
            <td>${item.stake || '-'}</td>
            <td class="${resultClass}">${item.resultEmoji || ''} ${item.result || '-'}</td>
            <td class="${profitClass}">${item.profit || '-'}</td>
            <td><small>${item.league || '-'}</small></td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
    countSpan.textContent = parsedData.length;
}

// Демо-данные
function showDemoData() {
    parsedData = [
        {
            addedDate: '2025-12-19',
            event: 'Walthamstow v Stanway Rovers',
            prediction: 'Match winner • Stanway Rovers',
            advisedOdds: '2.06',
            stake: '£10',
            result: 'won',
            profit: '+£10.60',
            league: 'England Isthmian Division One North',
            resultEmoji: '✅'
        },
        {
            addedDate: '2025-12-18',
            event: 'Vaduz v FC Aarau',
            prediction: 'Match winner • Vaduz',
            advisedOdds: '2.26',
            stake: '£10',
            result: 'won',
            profit: '+£12.60',
            league: 'Switzerland Challenge League',
            resultEmoji: '✅'
        }
    ];
    
    showResults();
    document.getElementById('export-btn').disabled = false;
    showNotification('⚠️ Показаны демо-данные (сервер недоступен)');
}

// Вспомогательные функции
function showLoading(show) {
    const loading = document.getElementById('loading');
    const btn = document.getElementById('parse-btn');
    
    if (show) {
        loading.style.display = 'block';
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    } else {
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Загрузить реальные данные';
    }
}

function showStatus(text, className) {
    const badge = document.getElementById('server-status');
    badge.textContent = text;
    badge.className = `status-badge ${className}`;
}

function showNotification(message) {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        background: #333;
        color: white;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    // Добавляем стили для анимации
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('ru-RU');
    } catch {
        return dateStr;
    }
}

function exportToExcel() {
    if (!parsedData.length) {
        showNotification('❌ Нет данных для экспорта');
        return;
    }
    
    try {
        // Подготавливаем данные для экспорта
        const exportData = parsedData.map(item => ({
            'Дата': item.addedDate,
            'Матч': item.event,
            'Прогноз': item.prediction,
            'Коэффициент': item.advisedOdds,
            'Ставка': item.stake,
            'Результат': item.result,
            'Прибыль': item.profit,
            'Лига': item.league
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tipstrr Прогнозы");
        
        const fileName = `tipstrr_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showNotification(`✅ Файл "${fileName}" сохранен`);
        
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        showNotification('❌ Ошибка экспорта: ' + error.message);
    }
}

// Добавляем обработчик ошибок fetch
if (!window.fetch) {
    alert('Ваш браузер не поддерживает fetch API. Обновите браузер.');
}

// Добавляем timeout для fetch
if (!fetch.prototype.timeout) {
    fetch.prototype.timeout = function(ms) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request timeout after ${ms}ms`));
            }, ms);
            
            this.then(response => {
                clearTimeout(timeout);
                resolve(response);
            }).catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    };
}
