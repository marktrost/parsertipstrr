// Счётчик посещений
let visitCount = localStorage.getItem('visitCount') || 0;
visitCount++;
localStorage.setItem('visitCount', visitCount);
document.getElementById('visit-count').textContent = visitCount;

// Плавная прокрутка для навигации
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if(targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if(targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    });
});

// Анимация при скролле
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if(entry.isIntersecting) {
            entry.target.classList.add('animated');
        }
    });
}, observerOptions);

// Наблюдаем за карточками
document.querySelectorAll('.card, .project-card').forEach(card => {
    observer.observe(card);
});

// Консольное приветствие
console.log('%c👋 Привет! Этот сайт создан прямо из компьютерного клуба!', 
    'color: #6c63ff; font-size: 16px; font-weight: bold;');
console.log('%c🚀 Успешного деплоя на Render!', 
    'color: #ff6584; font-size: 14px;');
