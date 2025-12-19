let parsedData = [];

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('Парсер Tipstrr загружен');
    
    // Вешаем обработчик на кнопку
    const parseBtn = document.getElementById('parse-btn');
    if (parseBtn) {
        parseBtn.addEventListener('click', parseExactData);
    }
    
    // Вешаем обработчик на экспорт
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }
});

// ================= ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА =================
async function parseExactData() {
    console.log('🎯 Запускаю точный парсинг по найденным селекторам...');
    showLoading(true);
    
    try {
        // 1. Загружаем страницу
        const url = document.getElementById('url-input').value;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        console.log('📡 Загружаю:', url);
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        
        const html = await response.text();
        console.log('📄 HTML получен, размер:', html.length, 'символов');
        
        // 2. Парсим HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 3. Ищем КОНТЕЙНЕРЫ С ПРОГНОЗАМИ
        // Сначала пробуем найти по структуре из диагностики
        let tipContainers = [];
        
        // Пробуем разные селекторы для контейнеров
        const containerSelectors = [
            'article', // Основные статьи
            'article div.bg-white', // Белые карточки внутри статей
            '[class*="card"]', // Любые карточки
            'div.bg-white.rounded-lg', // Скругленные белые блоки
            'section, article, div' // Все возможные контейнеры
        ];
        
        for (const selector of containerSelectors) {
            const found = doc.querySelectorAll(selector);
            console.log(`По селектору "${selector}" найдено: ${found.length}`);
            
            // Фильтруем только те, что содержат признаки прогноза
            const filtered = Array.from(found).filter(container => {
                const text = container.textContent || '';
                return text.includes('Match winner') && 
                       text.includes('Advised odds') &&
                       text.length > 200;
            });
            
            if (filtered.length > 0) {
                console.log(`✅ Нашёл ${filtered.length} контейнеров с прогнозами`);
                tipContainers = filtered;
                break;
            }
        }
        
        // Если не нашли по селекторам, ищем по содержанию
        if (tipContainers.length === 0) {
            console.log('🔍 Ищу контейнеры по содержанию текста...');
            const allElements = doc.querySelectorAll('*');
            tipContainers = Array.from(allElements).filter(el => {
                const text = el.textContent || '';
                return text.includes('Match winner') && 
                       text.includes('Advised odds') &&
                       text.length > 200 &&
                       text.length < 2000; // Не слишком большие
            });
            console.log(`Нашёл по содержанию: ${tipContainers.length}`);
        }
        
        // 4. ПАРСИМ КАЖДЫЙ КОНТЕЙНЕР
        parsedData = [];
        
        tipContainers.forEach((container, index) => {
            console.log(`\n🔍 Парсинг контейнера ${index + 1}...`);
            const tip = parseTipFromContainer(container);
            
            if (tip && tip.event) {
                console.log(`✅ Найден прогноз: ${tip.event}`);
                parsedData.push(tip);
            } else {
                console.log(`❌ Не удалось распарсить контейнер ${index + 1}`);
            }
        });
        
        console.log(`\n📊 ИТОГО: ${parsedData.length} прогнозов из ${tipContainers.length} контейнеров`);
        
        // 5. ПОКАЗЫВАЕМ РЕЗУЛЬТАТЫ
        if (parsedData.length > 0) {
            showResults();
            document.getElementById('export-btn').disabled = false;
            
            // Обновляем таблицу для 8 колонок
            updateTableFor8Columns();
            
            alert(`✅ Успех! Найдено ${parsedData.length} реальных прогнозов.`);
        } else {
            alert('❌ Не удалось найти прогнозы. Попробуйте: 1) Открыть страницу в браузере 2) Проверить, видите ли вы прогнозы 3) Сделать скриншот страницы');
        }
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        alert('Ошибка: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ================= ПАРСИНГ ОДНОГО КОНТЕЙНЕРА =================
function parseTipFromContainer(container) {
    try {
        const tip = {};
        const text = container.textContent || '';
        
        // 1. НАЗВАНИЕ МАТЧА (самое важное!)
        // Селектор из диагностики: a[href*="/fixture/"]
        const eventLink = container.querySelector('a[href*="/fixture/"]');
        if (eventLink) {
            tip.event = eventLink.textContent.trim();
            console.log('   Событие:', tip.event);
        }
        
        // 2. ДАТА ДОБАВЛЕНИЯ ПРОГНОЗА
        // Из ссылки с /tips/
        const addedLink = container.querySelector('a[href*="/tips/"]');
        if (addedLink) {
            const timeElement = addedLink.querySelector('time');
            if (timeElement) {
                tip.addedDate = timeElement.getAttribute('datetime') || timeElement.textContent.trim();
            }
        }
        
        // 3. ДАТА МАТЧА
        // Ищем все time элементы и берем второй (первый - дата добавления)
        const allTimeElements = container.querySelectorAll('time');
        if (allTimeElements.length >= 2) {
            const matchTime = allTimeElements[1];
            tip.matchDateTime = matchTime.getAttribute('datetime') || matchTime.textContent.trim();
        }
        
        // 4. ПРОГНОЗ (Market • Selection)
        // Селектор из диагностики: dt
        const marketElement = container.querySelector('dt');
        if (marketElement) {
            tip.prediction = marketElement.textContent.trim().replace(/\s+/g, ' ');
            console.log('   Прогноз:', tip.prediction);
        }
        
        // 5. КОЭФФИЦИЕНТ
        // Селектор из диагностики: [data-odds]
        const oddsElement = container.querySelector('[data-odds]');
        if (oddsElement) {
            tip.advisedOdds = oddsElement.getAttribute('data-odds') || oddsElement.textContent.trim();
            console.log('   Коэф:', tip.advisedOdds);
        }
        
        // 6. СТАВКА (£10)
        // Ищем текст "£" и "stake"
        const stakeMatch = text.match(/£(\d+(?:\.\d{2})?)\s*stake/i);
        if (stakeMatch) {
            tip.stake = `£${stakeMatch[1]}`;
        }
        
        // 7. РЕЗУЛЬТАТ (won/lost)
        // Ищем по тексту или классам
        if (text.includes('won') || /won|win/i.test(text) || container.querySelector('.bg-success-dark-2')) {
            tip.result = 'won';
        } else if (text.includes('lost') || /lost|loss/i.test(text)) {
            tip.result = 'lost';
        } else {
            tip.result = 'unknown';
        }
        
        // 8. ПРИБЫЛЬ (+£6.32)
        // Ищем +£ или -£
        const profitMatch = text.match(/[+-]£(\d+\.\d{2})/);
        if (profitMatch) {
            tip.profit = profitMatch[0];
        } else {
            // Если не нашли, вычисляем из текста
            const profitText = text.match(/[+-]\d+\.\d{2}/);
            if (profitText) {
                tip.profit = `£${profitText[0]}`;
            }
        }
        
        // Только если есть название события - считаем валидным
        return tip.event ? tip : null;
        
    } catch (error) {
        console.error('   Ошибка парсинга контейнера:', error);
        return null;
    }
}

// ================= ПОКАЗ РЕЗУЛЬТАТОВ =================
function showResults() {
    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('count');
    
    if (!tbody || !countSpan) {
        console.error('Не найдены элементы таблицы');
        return;
    }
    
    if (!parsedData || parsedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
        countSpan.textContent = '0';
        return;
    }
    
    // Создаем строки таблицы
    let html = '';
    
    parsedData.forEach((item, index) => {
        html += `
            <tr>
                <td>${formatDate(item.addedDate)}</td>
                <td>${formatDate(item.matchDateTime)}</td>
                <td>${item.event || '—'}</td>
                <td>${item.prediction || '—'}</td>
                <td>${item.advisedOdds || '—'}</td>
                <td>${item.stake || '—'}</td>
                <td class="${item.result === 'won' ? 'success' : 'error'}">${item.result || '—'}</td>
                <td class="${(item.profit || '').startsWith('+') ? 'success' : 'error'}">${item.profit || '—'}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    countSpan.textContent = parsedData.length;
}

// Обновляем таблицу для 8 колонок
function updateTableFor8Columns() {
    const table = document.getElementById('results-table');
    if (!table) return;
    
    // Уже обновлено в HTML, просто проверяем
    const headers = table.querySelectorAll('th');
    if (headers.length === 5) {
        console.log('⚠️ Таблица имеет 5 колонок вместо 8. Проверь HTML.');
    }
}

// ================= УТИЛИТЫ =================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            // Если это строка типа "18th December 2025 at 15:31"
            return dateStr.substring(0, 20);
        }
        return date.toISOString().split('T')[0];
    } catch {
        return dateStr.substring(0, 10);
    }
}

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

// ================= ЭКСПОРТ В EXCEL =================
function exportToExcel() {
    if (!parsedData || parsedData.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }
    
    try {
        // Подготавливаем данные для экспорта
        const exportData = parsedData.map(item => ({
            'Дата добавления': item.addedDate || '',
            'Дата матча': item.matchDateTime || '',
            'Матч': item.event || '',
            'Прогноз': item.prediction || '',
            'Коэффициент': item.advisedOdds || '',
            'Ставка': item.stake || '',
            'Результат': item.result || '',
            'Прибыль': item.profit || ''
        }));
        
        // Создаем Excel файл
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Прогнозы Tipstrr");
        
        // Сохраняем файл
        const fileName = `tipstrr_прогнозы_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        alert(`✅ Файл "${fileName}" успешно сохранен!`);
        
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        alert('❌ Ошибка при экспорте: ' + error.message);
    }
}

// ================= ТЕСТОВЫЕ ФУНКЦИИ =================
function testAPI() {
    console.log('=== ТЕСТ API ===');
    alert('Тест API запущен. Смотри консоль.');
    
    // Просто проверяем загрузку страницы
    fetch('https://corsproxy.io/?https://tipstrr.com/tipster/freguli/results')
        .then(r => console.log('Статус:', r.status))
        .catch(e => console.error('Ошибка:', e));
}

function simpleTest() {
    console.log('=== ПРОСТОЙ ТЕСТ ===');
    console.log('1. Функция parseExactData:', typeof parseExactData);
    console.log('2. parsedData массив:', parsedData.length, 'элементов');
    console.log('3. Кнопка парсинга:', document.getElementById('parse-btn'));
    alert('Тест завершен. Смотри консоль.');
}

// Автозагрузка
console.log('Парсер готов. Нажми "Парсить" для начала.');
