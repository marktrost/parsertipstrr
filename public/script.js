// Измените функцию startParsing() на:
async function startParsing() {
    const count = document.getElementById('tip-count').value || 50;
    
    showLoading(true);
    startTime = Date.now();
    
    try {
        // Запрос к нашему серверу
        const response = await fetch(`/api/tips?count=${count}`);
        const result = await response.json();
        
        if (result.success) {
            parsedData = result.tips;
            updateTable();
            updateStats();
            enableExportButtons();
            
            const parseTime = ((Date.now() - startTime) / 1000).toFixed(2);
            toastr.success(`${result.tips.length} прогнозов за ${parseTime} сек`, 'Успех!');
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        toastr.error(error.message, 'Ошибка!');
    } finally {
        showLoading(false);
    }
}
