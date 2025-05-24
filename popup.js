document.addEventListener("DOMContentLoaded", () => {
  // Элементы интерфейса
  const searchBtn = document.getElementById("search-btn");
  const createBaseBtn = document.getElementById("create-base-btn");
  const resultsDiv = document.getElementById("results");
  const savedContainer = document.getElementById("saved-list");
  const articleInput = document.getElementById("article-url");

  // Инициализация
  renderSavedArticles();

  // Создание новой базы статей
  createBaseBtn.addEventListener("click", async () => {
    const query = prompt("Введите запрос для формирования базы (например: 'machine learning 2023'):");
    if (query) {
      try {
        // Показываем состояние загрузки
        createBaseBtn.innerHTML = '<span class="loader"></span> Загрузка...';
        createBaseBtn.disabled = true;

        const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=50`);
        const data = await response.json();
        
        localStorage.setItem("article_base", JSON.stringify(data.results));
        showNotification(`База создана! Загружено ${data.results.length} статей.`, 'success');
      } catch (error) {
        console.error("Ошибка при создании базы:", error);
        showNotification("Ошибка при создании базы", 'error');
      } finally {
        createBaseBtn.innerHTML = '<span>🛠️</span> Создать новую базу';
        createBaseBtn.disabled = false;
      }
    }
  });

  // Поиск статей
  searchBtn.addEventListener("click", () => {
    showAdvancedSearchModal();
  });

  // Автодополнение при вводе
  articleInput.addEventListener("input", debounce(async (e) => {
    const query = e.target.value.trim();
    if (query.length < 3) return;

    try {
      const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=3`);
      const data = await response.json();
      showSuggestions(data.results);
    } catch (error) {
      console.error("Ошибка автодополнения:", error);
    }
  }, 300));

  // Модальное окно расширенного поиска
  function showAdvancedSearchModal() {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Расширенный поиск</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="search-filters">
          <div class="input-group">
            <label for="article-query" class="input-label">Ключевые слова</label>
            <input 
              type="text" 
              id="article-query" 
              class="input-field" 
              placeholder="Название, тема или ключевые слова"
              autofocus
            />
          </div>
          
          <div class="filter-row">
            <div class="input-group">
              <label for="year-filter" class="input-label">Год</label>
              <input 
                type="number" 
                id="year-filter" 
                class="input-field" 
                placeholder="Например: 2023"
                min="1900"
                max="${new Date().getFullYear()}"
              />
            </div>
            
            <div class="input-group">
              <label for="month-filter" class="input-label">Месяц</label>
              <select id="month-filter" class="input-field">
                <option value="">Любой</option>
                ${Array.from({length: 12}, (_, i) => `
                  <option value="${i+1}">
                    ${new Date(0, i).toLocaleString('ru', {month: 'long'})}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
          
          <div class="input-group">
            <label for="topic-filter" class="input-label">Тематика</label>
            <input 
              type="text" 
              id="topic-filter" 
              class="input-field" 
              placeholder="Например: Artificial Intelligence"
            />
          </div>
        </div>
        <button id="advanced-search-btn" class="btn" style="width: 100%; margin-top: 12px;">
          <span>🔍</span> Найти похожие статьи
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    // Закрытие модального окна
    modal.querySelector(".close-btn").addEventListener("click", () => {
      modal.remove();
    });

    // Обработка поиска
    modal.querySelector("#advanced-search-btn").addEventListener("click", async () => {
      const query = modal.querySelector("#article-query").value.trim();
      const year = modal.querySelector("#year-filter").value;
      const topic = modal.querySelector("#topic-filter").value.trim();
      const month = modal.querySelector("#month-filter").value;
      
      if (!query) {
        showNotification("Введите хотя бы ключевые слова для поиска", 'warning');
        return;
      }

      modal.remove();
      await performAdvancedSearch(query, year, month, topic);
    });
  }

  // Выполнение расширенного поиска
  async function performAdvancedSearch(query, year, month, topic) {
    // Показываем индикатор загрузки
    resultsDiv.innerHTML = `
      <div class="article-card" style="text-align: center; padding: 30px;">
        <div class="loader" style="margin: 0 auto;"></div>
        <p style="margin-top: 16px;">Ищем похожие статьи...</p>
      </div>
    `;

    try {
      // Формируем URL для запроса
      let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10`;
      if (year) searchUrl += `&filter=publication_year:${year}`;
      if (month) searchUrl += `&filter=publication_month:${month}`;
      if (topic) searchUrl += `&filter=concepts.search:${topic}`;

      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        displayResultsWithSimilarity(data.results, query);
      } else {
        resultsDiv.innerHTML = `
          <div class="article-card">
            <p>По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.</p>
          </div>
        `;
      }
    } catch (error) {
      console.error("Ошибка поиска:", error);
      resultsDiv.innerHTML = `
        <div class="article-card" style="color: var(--danger);">
          <p>Ошибка при выполнении поиска. Пожалуйста, попробуйте позже.</p>
        </div>
      `;
    }
  }

  // Отображение результатов с расчетом схожести
  function displayResultsWithSimilarity(articles, originalQuery) {
    resultsDiv.innerHTML = "";

    // Основная статья
    const mainArticle = articles[0];
    const mainSimilarity = calculateSimilarity(originalQuery, mainArticle.display_name);
    
    resultsDiv.innerHTML += `
      <div class="article-card">
        <h3 class="article-title">${mainArticle.display_name}</h3>
        <div class="article-meta">
          <span>${mainArticle.publication_year || "Год не указан"}</span>
          <span>${mainArticle.authorships?.slice(0, 3).map(a => a.author.display_name).join(", ") || "Авторы не указаны"}</span>
          <span class="similarity-badge">${(mainSimilarity * 100).toFixed(1)}% схожести</span>
        </div>
        
        ${mainArticle.abstract ? `
          <div class="article-abstract">
            <p>${truncate(mainArticle.abstract, 200)}</p>
          </div>
        ` : ''}
        
        <div class="actions">
          <a href="${mainArticle.id}" target="_blank" class="btn">
            <span>📖</span> Открыть статью
          </a>
          <button class="btn save-btn" data-id="${mainArticle.id}" data-title="${mainArticle.display_name}">
            <span>💾</span> Сохранить
          </button>
        </div>
      </div>
    `;

    // Ближайшие публикации (5 штук)
    if (articles.length > 1) {
      resultsDiv.innerHTML += `
        <h3 style="margin: 20px 0 12px; font-size: 16px; color: var(--dark);">
          Ближайшие публикации
        </h3>
      `;
      
      articles.slice(1, 6).forEach(article => {
        const similarity = calculateSimilarity(originalQuery, article.display_name);
        resultsDiv.innerHTML += `
          <div class="article-card" style="padding: 12px; cursor: pointer;" onclick="window.open('${article.id}', '_blank')">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h4 style="margin: 0; font-size: 14px; font-weight: 500; color: var(--dark);">
                ${truncate(article.display_name, 60)}
              </h4>
              <span class="similarity-badge">${(similarity * 100).toFixed(1)}%</span>
            </div>
            <div style="font-size: 13px; color: var(--gray); margin-top: 6px;">
              ${article.publication_year || ""} • ${article.authorships?.[0]?.author?.display_name || "Автор не указан"}
            </div>
          </div>
        `;
      });
    }

    // Добавляем обработчики для кнопок сохранения
    document.querySelectorAll(".save-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const id = this.getAttribute("data-id");
        const title = this.getAttribute("data-title");
        saveArticle(id, title);
      });
    });
  }

  // Функция сохранения статьи
  function saveArticle(id, title) {
    let saved = JSON.parse(localStorage.getItem("saved_articles") || "[]");
    if (!saved.find(s => s.id === id)) {
      saved.push({ id, title });
      localStorage.setItem("saved_articles", JSON.stringify(saved));
      renderSavedArticles();
      showNotification("Статья сохранена в избранное!", 'success');
    } else {
      showNotification("Эта статья уже сохранена", 'info');
    }
  }

  // Отображение сохраненных статей
  function renderSavedArticles() {
    const saved = JSON.parse(localStorage.getItem("saved_articles") || "[]");
    savedContainer.innerHTML = "";
    
    if (saved.length > 0) {
      savedContainer.innerHTML = `
        <h3 style="margin-bottom: 12px; font-size: 15px; color: var(--gray); display: flex; align-items: center; gap: 6px;">
          <span>📚</span> Избранные статьи (${saved.length})
        </h3>
        <div style="background: white; border-radius: var(--border-radius); padding: 8px; box-shadow: var(--box-shadow);">
      `;
      
      saved.forEach(article => {
        savedContainer.innerHTML += `
          <div class="saved-item">
            <a href="${article.id}" target="_blank" title="${article.title}">
              ${truncate(article.title, 50)}
            </a>
            <button 
              class="remove-btn" 
              data-id="${article.id}"
              title="Удалить из избранного"
              style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px 6px;"
            >
              ✕
            </button>
          </div>
        `;
      });
      
      savedContainer.innerHTML += `</div>`;
      
      // Обработчики для кнопок удаления
      document.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          removeArticle(id);
        });
      });
    }
  }

  // Удаление статьи из избранного
  function removeArticle(id) {
    let saved = JSON.parse(localStorage.getItem("saved_articles") || "[]");
    saved = saved.filter(article => article.id !== id);
    localStorage.setItem("saved_articles", JSON.stringify(saved));
    renderSavedArticles();
    showNotification("Статья удалена из избранного", 'info');
  }

  // Вспомогательные функции
  function calculateSimilarity(query, title) {
    const queryWords = new Set(
      query.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
    );
    
    const titleWords = new Set(
      title.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
    );
    
    const intersection = new Set(
      [...queryWords].filter(word => titleWords.has(word))
    );
    
    return Math.min(0.99, intersection.size / queryWords.size * 1.5);
  }

  function truncate(str, n) {
    return str.length > n ? str.substr(0, n-1) + '...' : str;
  }

  function debounce(func, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function showNotification(message, type = 'info') {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Показ подсказок при вводе
  function showSuggestions(articles) {
    // Реализация автодополнения...
  }
});

// Добавляем стили для уведомлений
const notificationStyles = document.createElement("style");
notificationStyles.textContent = `
  .notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: var(--border-radius);
    color: white;
    box-shadow: var(--box-shadow);
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
  }
  
  .notification-info {
    background: var(--primary);
  }
  
  .notification-success {
    background: var(--success);
  }
  
  .notification-error {
    background: var(--danger);
  }
  
  .notification-warning {
    background: #ffc107;
    color: var(--dark);
  }
  
  .fade-out {
    animation: fadeOut 0.3s ease-in;
    opacity: 0;
  }
  
  @keyframes slideIn {
    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  .loader {
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 3px solid white;
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
    display: inline-block;
    vertical-align: middle;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(notificationStyles);