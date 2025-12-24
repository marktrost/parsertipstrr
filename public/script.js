// Tipstrr Parser Client - Браузерная версия
let parsedData = [];
let serverBaseUrl = '';

// Автоматически определяем URL сервера
function detectServerUrl() {
    const currentUrl = window.location.origin;
    
    // Если на Render - используем текущий домен
    if (currentUrl.includes('render.com')) {
        serverBaseUrl = currentUrl;
    } else if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
        // Локальная разработка
        serverBaseUrl = 'http://localhost:3000';
    } else {
        // Продакшен на Render (замени на свой URL)
        serverBaseUrl = 'https://parsertipstrrweb.onrender.com';
    }
    
    console.log('🌐 Сервер определен:', serverBaseUrl);
    return serverBaseUrl;
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Tipstrr Parser загружен (браузерная версия)');
    
    // Определяем URL сервера
    serverBaseUrl = detectServerUrl();
    
    // Назначаем обработчики кнопок
    document.getElementById('parse-btn').addEventListener('click', fetchRealData);
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
    
    // Если есть кнопки для отладки
    const debugBtn = document.getElementById('debug-btn');
    const statsBtn = document.getElementById('stats-btn');
    const forceBtn = document.getElementById('force-btn');
    
    if (debugBtn) debugBtn.addEventListener('click', checkServerStatus);
    if (statsBtn) statsBtn.addEventListener('click', showStats);
    if (forceBtn) forceBtn.addEventListener('click', () => fetchRealData(true));
    
    // Проверяем статус сервера при загрузке
    checkServerStatus();
    
    console.log('✅ Парсер готов к работе! Нажми "Загрузить реальные данные"');
});

// Проверка статуса сервера
async function checkServerStatus() {
    try {
        updateStatus('Сервер: проверка...', 'status-offline');
        
        const response = await fetch(`${serverBaseUrl}/api/health`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            updateStatus('Сервер: онлайн', 'status-online');
            
            // Обновляем информацию о сервере
            const serverInfo = document.getElementById('server-info');
            const statusText = document.getElementById('server-status-text');
            const serverTime = document.getElementById('server-time');
            const serverMode = document.getElementById('server-mode');
            
            if (serverInfo) serverInfo.style.display = 'block';
            if (statusText) statusText.textContent = '✅ Онлайн';
            if (serverTime) serverTime.textContent = new Date(data.timestamp).toLocaleString('ru-RU');
            if (serverMode) serverMode.textContent = data.environment || 'production';
            
            return true;
        } else {
            throw new Error('Неверный ответ сервера');
        }
        
    } catch (error) {
        console.error('❌ Ошибка подключения к серверу:', error);
        updateStatus('Сервер: офлайн', 'status-offline');
        
        // Показываем информацию об ошибке
        const serverInfo = document.getElementById('server-info');
        const statusText = document.getElementById('server-status-text');
        
        if (serverInfo) serverInfo.style.display = 'block';
        if (statusText) statusText.textContent = '❌ Офлайн';
        
        alert(`Ошибка подключения к серверу:\n${error.message}\n\nУбедитесь, что сервер запущен по адресу:\n${serverBaseUrl}`);
        
        return false;
    }
}

// Обновление статуса на странице
function updateStatus(text, className) {
    const statusElement = document.getElementById('server-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `status-badge ${className}`;
    }
}

// Загрузка реальных данных
async function fetchRealData(forceRefresh = false) {
    showLoading(true);
    
    try {
        const count = document.getElementById('count-select').value;
        const url = `${serverBaseUrl}/api/tips?count=${count}${forceRefresh ? '&force=true' : ''}`;
        
        console.log(`🚀 Запрос данных: ${url}`);
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            parsedData = result.tips || [];
            
            // Показываем информацию о кэше
            const cacheInfo = document.getElementById('cache-info');
            if (cacheInfo && result.cached) {
                cacheInfo.style.display = 'inline';
                cacheInfo.title = `Данные из кэша (возраст: ${Math.round(result.cacheAge / 1000)} сек)`;
            } else if (cacheInfo) {
                cacheInfo.style.display = 'none';
            }
            
            if (parsedData.length > 0) {
                showResults();
                document.getElementById('export-btn').disabled = false;
                
                // Обновляем статус
                const lastUpdate = document.getElementById('last-update');
                if (lastUpdate) {
                    lastUpdate.textContent = new Date().toLocaleString('ru-RU');
                }
                
                // Показываем уведомление
                showNotification(`✅ Получено ${parsedData.length} прогнозов${result.cached ? ' (из кэша)' : ''}`);
                
            } else {
                showNotification('⚠️ Сервер вернул пустой список прогнозов');
            }
            
        } else {
            throw new Error(result.message || result.error || 'Неизвестная ошибка сервера');
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
        const response = await fetch(`${serverBaseUrl}/api/stats`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
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
        } else {
            throw new Error(result.error || 'Ошибка получения статистики');
        }
        
    } catch (error) {
        alert('Ошибка получения статистики: ' + error.message);
    }
}

// Отображение результатов в таблице
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (!parsedData.length) {
        tbody.innerHTML = '<tr><td colspan="8">Нет данных для отображения</td></tr>';
        if (countSpan) countSpan.textContent = '0';
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
    if (countSpan) countSpan.textContent = parsedData.length;
}

// Демо-данные для тестирования
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
        },
        {
            addedDate: '2025-12-17',
            event: 'Stade Nyonnais v Xamax',
            prediction: 'Match winner • Stade Nyonnais',
            advisedOdds: '3.45',
            stake: '£10',
            result: 'lost',
            profit: '-£10',
            league: 'Switzerland Challenge League',
            resultEmoji: '❌'
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
    
    if (!loading || !btn) return;
    
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

function showNotification(message) {
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: #333;
        color: white;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
        max-width: 400px;
        word-wrap: break-word;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Удаляем через 4 секунды
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 4000);
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
        // Проверяем, что XLSX библиотека загружена
        if (typeof XLSX === 'undefined') {
            throw new Error('Библиотека XLSX не загружена');
        }
        
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
        
        // Альтернативный экспорт в CSV
        if (confirm('XLSX не работает. Экспортировать в CSV?')) {
            exportToCSV();
        }
    }
}

function exportToCSV() {
    if (!parsedData.length) return;
    
    let csv = 'Дата,Матч,Прогноз,Коэффициент,Ставка,Результат,Прибыль,Лига\n';
    
    parsedData.forEach(item => {
        csv += `"${item.addedDate || ''}","${item.event || ''}","${item.prediction || ''}",`;
        csv += `"${item.advisedOdds || ''}","${item.stake || ''}","${item.result || ''}",`;
        csv += `"${item.profit || ''}","${item.league || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `tipstrr_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('✅ CSV файл сохранен');
}

// Проверка поддержки AbortSignal.timeout (для старых браузеров)
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
    AbortSignal.timeout = function(ms) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error('Timeout')), ms);
        return controller.signal;
    };
}

// Проверка при загрузке
window.onload = function() {
    console.log('🌍 Tipstrr Parser запущен');
    console.log('🔗 Текущий URL:', window.location.href);
    console.log('📁 Server URL:', serverBaseUrl);
};
