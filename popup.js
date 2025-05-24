document.addEventListener("DOMContentLoaded", () => {
  const searchBtn = document.getElementById("search-btn");
  const createBaseBtn = document.getElementById("create-base-btn");
  const resultsDiv = document.getElementById("results");
  const savedContainer = document.getElementById("saved-list");

  // Инициализация
  renderSavedArticles();

  // Создание новой базы
  createBaseBtn.addEventListener("click", async () => {
    const query = prompt("Введите запрос для формирования базы (например: 'machine learning 2023'):");
    if (query) {
      try {
        createBaseBtn.disabled = true;
        createBaseBtn.textContent = "Загрузка...";
        
        const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=50`);
        const data = await response.json();
        
        localStorage.setItem("article_base", JSON.stringify(data.results));
        alert(`База создана! Загружено ${data.results.length} статей.`);
      } catch (error) {
        console.error("Ошибка при создании базы:", error);
        alert("Ошибка при создании базы");
      } finally {
        createBaseBtn.disabled = false;
        createBaseBtn.textContent = "Создать новую базу";
      }
    }
  });

  // Поиск статей
  searchBtn.addEventListener("click", () => {
    showAdvancedSearchModal();
  });

  // Модальное окно расширенного поиска
  function showAdvancedSearchModal() {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <h3>Расширенный поиск</h3>
        <input type="text" id="article-query" placeholder="Название или ключевые слова" />
        <div class="search-filters">
          <input type="number" id="year-filter" placeholder="Год (например 2023)" />
          <input type="text" id="topic-filter" placeholder="Тема (например: AI)" />
          <select id="month-filter">
            <option value="">Любой месяц</option>
            ${Array.from({length: 12}, (_, i) => `<option value="${i+1}">${new Date(0, i).toLocaleString('ru', {month: 'long'})}</option>`).join('')}
          </select>
        </div>
        <button id="advanced-search-btn">Найти похожие</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".close").addEventListener("click", () => {
      modal.remove();
    });

    modal.querySelector("#advanced-search-btn").addEventListener("click", async () => {
      const query = modal.querySelector("#article-query").value;
      const year = modal.querySelector("#year-filter").value;
      const topic = modal.querySelector("#topic-filter").value;
      const month = modal.querySelector("#month-filter").value;
      
      if (!query) {
        alert("Введите хотя бы название или ключевые слова");
        return;
      }

      modal.remove();
      await performAdvancedSearch(query, year, month, topic);
    });
  }

  // Выполнение расширенного поиска
  async function performAdvancedSearch(query, year, month, topic) {
    resultsDiv.innerHTML = "<p>Идёт поиск...</p>";

    let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10`;
    if (year) searchUrl += `&filter=publication_year:${year}`;
    if (month) searchUrl += `&filter=publication_month:${month}`;
    if (topic) searchUrl += `&filter=concepts.search:${topic}`;

    try {
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        displayResultsWithSimilarity(data.results, query);
      } else {
        resultsDiv.innerHTML = "<p>По вашему запросу ничего не найдено.</p>";
      }
    } catch (error) {
      console.error("Ошибка поиска:", error);
      resultsDiv.innerHTML = "<p style='color:red'>Ошибка при выполнении поиска.</p>";
    }
  }

  // Отображение результатов с расчетом схожести
  function displayResultsWithSimilarity(articles, originalQuery) {
    resultsDiv.innerHTML = "<h3>Результаты поиска:</h3>";

    // Основная статья
    const mainArticle = articles[0];
    const mainSimilarity = calculateSimilarity(originalQuery, mainArticle.display_name);
    
    resultsDiv.innerHTML += `
      <div class="main-article">
        <p><strong>${mainArticle.display_name}</strong> (${(mainSimilarity * 100).toFixed(1)}% схожести)</p>
        <p>Авторы: ${mainArticle.authorships?.map(a => a.author.display_name).join(", ") || "Неизвестны"}</p>
        <p>Год: ${mainArticle.publication_year || "Неизвестен"}</p>
        <a href="${mainArticle.id}" target="_blank">Открыть в OpenAlex</a>
        <button class="save-btn" data-id="${mainArticle.id}" data-title="${mainArticle.display_name}">Сохранить</button>
      </div>
    `;

    // Ближайшие публикации (5 штук)
    if (articles.length > 1) {
      resultsDiv.innerHTML += `<h4>Ближайшие публикации:</h4><div class="nearest-articles">`;
      
      articles.slice(1, 6).forEach(article => {
        const similarity = calculateSimilarity(originalQuery, article.display_name);
        resultsDiv.innerHTML += `
          <div class="similar-article">
            <p><strong>${article.display_name}</strong> (${(similarity * 100).toFixed(1)}%)</p>
            <p>${article.publication_year || ""} | ${article.authorships?.[0]?.author?.display_name || ""}</p>
            <a href="${article.id}" target="_blank">Открыть</a>
          </div>
        `;
      });
      
      resultsDiv.innerHTML += `</div>`;
    }

    // Добавляем обработчики для кнопок сохранения
    document.querySelectorAll(".save-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const title = btn.getAttribute("data-title");
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
      alert("Сохранено в избранное!");
    } else {
      alert("Эта статья уже сохранена.");
    }
  }

  // Расчет схожести (упрощенный)
  function calculateSimilarity(query, title) {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const titleWords = new Set(title.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...queryWords].filter(x => titleWords.has(x)));
    return Math.min(0.99, intersection.size / queryWords.size * 1.5);
  }

  // Отображение сохраненных статей
  function renderSavedArticles() {
    const saved = JSON.parse(localStorage.getItem("saved_articles") || "[]");
    savedContainer.innerHTML = "";
    
    if (saved.length > 0) {
      savedContainer.innerHTML = "<h3>Избранные статьи:</h3>";
      const ul = document.createElement("ul");
      
      saved.forEach(article => {
        const li = document.createElement("li");
        li.innerHTML = `
          <a href="${article.id}" target="_blank">${article.title}</a>
          <button class="remove-btn" data-id="${article.id}">×</button>
        `;
        ul.appendChild(li);
      });
      
      savedContainer.appendChild(ul);
      
      // Добавляем обработчики для кнопок удаления
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
  }
});
