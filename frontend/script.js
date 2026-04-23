const API_URL = "https://kronofogden-backend.onrender.com/api/debts";
window.currentDebts = [];
let isSaving = false;

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatKr(value) {
  return `${safeNumber(value).toLocaleString("sv-SE")} kr`;
}

function getPriorityText(priority) {
  if (priority === "high") return "Hög prioritet";
  if (priority === "low") return "Låg prioritet";
  return "Medel prioritet";
}

function getPriorityClass(priority) {
  if (priority === "high") return "priority-high";
  if (priority === "low") return "priority-low";
  return "priority-medium";
}

function priorityRank(priority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function calculateScore(debt) {
  const amount = safeNumber(debt.amount);
  const monthlyPayment = safeNumber(debt.monthlyPayment);
  const priority = debt.priority || "medium";

  if (debt.paid) return 0;

  return amount * 0.4 + monthlyPayment * 0.8 + priorityRank(priority) * 2500;
}

function recommendationReason(debt) {
  const amount = safeNumber(debt.amount);
  const monthlyPayment = safeNumber(debt.monthlyPayment);
  const priority = debt.priority || "medium";

  if (priority === "high") return "Hög prioritet och bör hanteras först";
  if (monthlyPayment >= 1000) return "Stor månadsbetalning belastar ekonomin";
  if (amount >= 10000) return "Stort totalbelopp";
  return "Bra balans mellan belopp och prioritet";
}

function loadDebts() {
  fetch(API_URL)
    .then(response => response.json())
    .then(data => {
      const debts = Array.isArray(data) ? data.map(debt => ({
        ...debt,
        amount: safeNumber(debt.amount),
        monthlyPayment: safeNumber(debt.monthlyPayment),
        priority: debt.priority || "medium",
        paid: Boolean(debt.paid)
      })) : [];

      window.currentDebts = debts;
      renderDashboard(debts);
    })
    .catch(error => {
      console.error("Fel vid hämtning av skulder:", error);
      document.getElementById("debtList").innerHTML = "<li>Kunde inte hämta skulder.</li>";
    });
}

function renderDashboard(data) {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;
  const sortBy = document.getElementById("sortBy").value;

  let filtered = data.filter(debt => {
    const matchesSearch = !search || debt.name.toLowerCase().includes(search);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "paid" && debt.paid) ||
      (statusFilter === "unpaid" && !debt.paid);

    return matchesSearch && matchesStatus;
  });

  filtered.sort((a, b) => {
    if (sortBy === "amount_desc") return b.amount - a.amount;
    if (sortBy === "amount_asc") return a.amount - b.amount;
    if (sortBy === "name_asc") return a.name.localeCompare(b.name, "sv");
    return calculateScore(b) - calculateScore(a);
  });

  const totalDebt = data.reduce((sum, debt) => sum + debt.amount, 0);
  const paidCount = data.filter(debt => debt.paid).length;
  const unpaidCount = data.length - paidCount;
  const unpaidTotal = data.filter(debt => !debt.paid).reduce((sum, debt) => sum + debt.amount, 0);
  const progressPercent = data.length ? Math.round((paidCount / data.length) * 100) : 0;

  document.getElementById("totalDebt").textContent = formatKr(totalDebt);
  document.getElementById("heroTotalDebt").textContent = formatKr(unpaidTotal);
  document.getElementById("debtCount").textContent = data.length;
  document.getElementById("paidCount").textContent = paidCount;
  document.getElementById("unpaidCount").textContent = unpaidCount;
  document.getElementById("overviewText").textContent = `Du har betalat ${paidCount} av ${data.length} skulder`;
  document.getElementById("progressText").textContent = `${progressPercent}%`;
  document.getElementById("progressFill").style.width = `${progressPercent}%`;

  renderPriorityList(data);
  renderPaymentPlan(data);
  renderDebtList(filtered);
}

function renderPriorityList(data) {
  const priorityList = document.getElementById("priorityList");
  const prioritized = data
    .filter(debt => !debt.paid)
    .sort((a, b) => calculateScore(b) - calculateScore(a))
    .slice(0, 3);

  if (!prioritized.length) {
    priorityList.innerHTML = `<div class="muted">Inga obetalda skulder att prioritera.</div>`;
    return;
  }

  priorityList.innerHTML = prioritized.map((debt, index) => `
    <div class="priorityItem">
      <strong>${index + 1}. ${debt.name}</strong><br>
      <span class="muted">Belopp: ${formatKr(debt.amount)} • Månadsbetalning: ${formatKr(debt.monthlyPayment)}</span><br><br>
      <span class="tag ${getPriorityClass(debt.priority)}">${getPriorityText(debt.priority)}</span>
      <p>${recommendationReason(debt)}</p>
    </div>
  `).join("");
}

function renderPaymentPlan(data) {
  const paymentPlan = document.getElementById("paymentPlan");
  const budget = safeNumber(document.getElementById("monthlyBudget").value);

  const unpaid = data
    .filter(debt => !debt.paid)
    .sort((a, b) => calculateScore(b) - calculateScore(a));

  if (!unpaid.length) {
    paymentPlan.innerHTML = `<div class="muted">Ingen betalningsplan behövs just nu.</div>`;
    return;
  }

  let totalSuggested = 0;

  const html = unpaid.map(debt => {
    const suggested = debt.monthlyPayment > 0
      ? debt.monthlyPayment
      : Math.max(300, Math.round(debt.amount * 0.05));

    totalSuggested += suggested;

    const monthsLeft = suggested > 0 ? Math.ceil(debt.amount / suggested) : "-";

    return `
      <div class="planItem">
        <strong>${debt.name}</strong><br>
        <span class="muted">Rekommenderad månadsbetalning: ${formatKr(suggested)}</span><br>
        <span class="muted">Beräknad återbetalningstid: ${monthsLeft} mån</span>
      </div>
    `;
  }).join("");

  let budgetText = `<p>Föreslagen total månadsplan: <strong>${formatKr(totalSuggested)}</strong></p>`;

  if (budget > 0) {
    const diff = budget - totalSuggested;
    if (diff >= 0) {
      budgetText += `<p>Din budget räcker. Du har ungefär <strong>${formatKr(diff)}</strong> kvar per månad.</p>`;
    } else {
      budgetText += `<p>Din budget saknar ungefär <strong>${formatKr(Math.abs(diff))}</strong> per månad.</p>`;
    }
  }

  paymentPlan.innerHTML = budgetText + html;
}

function renderDebtList(data) {
  const list = document.getElementById("debtList");
  list.innerHTML = "";

  if (!data.length) {
    list.innerHTML = "<li>Inga skulder matchar filtret.</li>";
    return;
  }

  data.forEach(debt => {
    const li = document.createElement("li");

    li.innerHTML = `
      <div class="debtInfo">
        <div class="debtName">${debt.name}</div>
        <div class="debtMeta">
          Belopp: ${formatKr(debt.amount)} •
          Månadsbetalning: ${formatKr(debt.monthlyPayment)}
        </div>

        <span class="status ${debt.paid ? "paid" : ""}">
          ${debt.paid ? "Betald" : "Ej betald"}
        </span>

        <span class="tag ${getPriorityClass(debt.priority)}">
          ${getPriorityText(debt.priority)}
        </span>
      </div>

      <div class="actions">
        ${!debt.paid ? `<button class="payBtn" onclick="payDebt('${debt._id}')">Betala</button>` : ""}
        <button class="editBtn" onclick="editDebt('${debt._id}')">Redigera</button>
        <button class="deleteBtn" onclick="deleteDebt('${debt._id}')">Ta bort</button>
      </div>
    `;

    list.appendChild(li);
  });
}

function saveDebt() {
  if (isSaving) return;

  const saveBtn = document.getElementById("saveBtn");
  const editId = document.getElementById("editId").value;
  const name = document.getElementById("name").value.trim();
  const amount = safeNumber(document.getElementById("amount").value);
  const priority = document.getElementById("priority").value;
  const monthlyPayment = safeNumber(document.getElementById("monthlyPayment").value);

  if (!name || amount <= 0) {
    alert("Fyll i namn och giltigt belopp");
    return;
  }

  isSaving = true;
  saveBtn.disabled = true;
  saveBtn.textContent = "Sparar...";

  const payload = {
    name,
    amount,
    priority,
    monthlyPayment
  };

  const url = editId ? `${API_URL}/${editId}` : API_URL;
  const method = editId ? "PUT" : "POST";

  fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(() => {
      resetForm();
      loadDebts();
    })
    .catch(error => {
      console.error("Fel när skuld sparades:", error);
      alert("Det gick inte att spara skulden");
    })
    .finally(() => {
      isSaving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Spara skuld";
    });
}

function editDebt(id) {
  const debt = window.currentDebts.find(item => item._id === id);
  if (!debt) return;

  document.getElementById("editId").value = debt._id;
  document.getElementById("name").value = debt.name || "";
  document.getElementById("amount").value = debt.amount || "";
  document.getElementById("priority").value = debt.priority || "medium";
  document.getElementById("monthlyPayment").value = debt.monthlyPayment || "";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function resetForm() {
  document.getElementById("editId").value = "";
  document.getElementById("name").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("priority").value = "medium";
  document.getElementById("monthlyPayment").value = "";
}

function payDebt(id) {
  fetch(`${API_URL}/pay/${id}`, {
    method: "POST"
  })
    .then(res => res.json())
    .then(() => {
      loadDebts();
    })
    .catch(error => {
      console.error("Fel vid betalning av skuld:", error);
    });
}

function deleteDebt(id) {
  const confirmed = confirm("Vill du verkligen ta bort skulden?");
  if (!confirmed) return;

  fetch(`${API_URL}/${id}`, {
    method: "DELETE"
  })
    .then(res => res.json())
    .then(() => {
      loadDebts();
    })
    .catch(error => {
      console.error("Fel vid borttagning av skuld:", error);
    });
}

loadDebts();