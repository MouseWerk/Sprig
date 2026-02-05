const API_URL = window.location.origin + '/api';

let currentTab = 'decks';
let allDecks = [];
let allFolders = [];
let allAudio = [];
let allPDFs = [];
let allCards = {};

// Check if user is authenticated
function checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Handle authentication errors
function handleAuthError(response) {
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return true;
    }
    return false;
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const icon = toast.querySelector('i');
    
    toast.className = `toast ${type} show`;
    toastMessage.textContent = message;
    
    if (type === 'success') {
        icon.className = 'fas fa-check-circle';
    } else if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle';
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Check server connection
async function checkConnection() {
    if (!checkAuth()) return false;
    
    try {
        const response = await fetch(`${API_URL}/health`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-circle"></i> Connected';
            document.getElementById('connectionStatus').className = 'status connected';
            return true;
        }
        handleAuthError(response);
    } catch (error) {
        document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-circle"></i> Disconnected';
        document.getElementById('connectionStatus').className = 'status error';
        return false;
    }
}

// Switch tabs
function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.tab').classList.add('active');
    
    // Update sections
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${tab}-section`).classList.add('active');
    
    // Load data
    switch(tab) {
        case 'decks':
            loadDecks();
            break;
        case 'folders':
            loadFolders();
            break;
        case 'audio':
            loadAudio();
            break;
        case 'pdfs':
            loadPDFs();
            break;
        case 'cards':
            loadAllCards();
            break;
    }
}

// ===== DECKS =====
async function loadDecks() {
    if (!checkAuth()) return;
    
    const content = document.getElementById('decks-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading decks...</div>';
    
    try {
        const response = await fetch(`${API_URL}/decks`, {
            headers: getAuthHeaders()
        });
        
        if (handleAuthError(response)) return;
        
        allDecks = await response.json();
        
        if (allDecks.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <h3>No Decks Yet</h3>
                    <p>Create your first deck or import from CSV</p>
                </div>
            `;
            updateDeckStats();
            return;
        }
        
        displayDecks(allDecks);
        updateDeckStats();
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading decks</h3><p>${error.message}</p></div>`;
    }
}

function displayDecks(decks) {
    const content = document.getElementById('decks-content');
    
    let html = '<div class="card-grid">';
    
    decks.forEach(deck => {
        const progress = deck.totalCards > 0 ? Math.round((deck.learnedCards || 0) / deck.totalCards * 100) : 0;
        html += `
            <div class="item-card">
                <div class="item-card-header">
                    <div class="table-icon"><i class="fas fa-book"></i></div>
                    <div class="item-card-title">${deck.name}</div>
                </div>
                <div class="item-card-meta">
                    <span class="badge badge-${deck.type === 'csv' ? 'purple' : 'blue'}">
                        <i class="fas fa-${deck.type === 'csv' ? 'file-csv' : 'file-pdf'}"></i>
                        ${deck.type}
                    </span>
                    <span class="badge badge-green">
                        <i class="fas fa-layer-group"></i>
                        ${deck.totalCards || 0} cards
                    </span>
                </div>
                <div style="margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px;">
                        <span>Progress</span>
                        <span style="font-weight: 700;">${progress}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="item-card-actions">
                    <button class="action-btn btn-primary" onclick="editDeck('${deck.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn btn-success" onclick="viewDeckCards('${deck.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="action-btn btn-danger" onclick="deleteDeck('${deck.id}', '${deck.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    content.innerHTML = html;
}

function updateDeckStats() {
    const stats = document.getElementById('deck-stats');
    const totalCards = allDecks.reduce((sum, deck) => sum + (deck.totalCards || 0), 0);
    const learnedCards = allDecks.reduce((sum, deck) => sum + (deck.learnedCards || 0), 0);
    const avgProgress = totalCards > 0 ? Math.round(learnedCards / totalCards * 100) : 0;
    
    stats.innerHTML = `
        <div class="stat-card">
            <i class="stat-icon fas fa-layer-group"></i>
            <div class="stat-card-content">
                <div class="stat-value">${allDecks.length}</div>
                <div class="stat-label">Total Decks</div>
            </div>
        </div>
        <div class="stat-card">
            <i class="stat-icon fas fa-address-card"></i>
            <div class="stat-card-content">
                <div class="stat-value">${totalCards}</div>
                <div class="stat-label">Total Cards</div>
            </div>
        </div>
        <div class="stat-card">
            <i class="stat-icon fas fa-check-circle"></i>
            <div class="stat-card-content">
                <div class="stat-value">${learnedCards}</div>
                <div class="stat-label">Learned Cards</div>
            </div>
        </div>
        <div class="stat-card">
            <i class="stat-icon fas fa-chart-line"></i>
            <div class="stat-card-content">
                <div class="stat-value">${avgProgress}%</div>
                <div class="stat-label">Avg Progress</div>
            </div>
        </div>
    `;
}

function filterDecks() {
    const search = document.getElementById('deck-search').value.toLowerCase();
    const filtered = allDecks.filter(deck => 
        deck.name.toLowerCase().includes(search) ||
        deck.type.toLowerCase().includes(search)
    );
    displayDecks(filtered);
}

async function deleteDeck(id, name) {
    if (!confirm(`Delete deck "${name}"? This will also delete all associated cards.`)) return;
    
    try {
        const response = await fetch(`${API_URL}/decks/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        showToast('Deck deleted successfully');
        loadDecks();
    } catch (error) {
        showToast('Error deleting deck: ' + error.message, 'error');
    }
}

async function viewDeckCards(deckId) {
    currentTab = 'cards';
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab')[4].classList.add('active');
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById('cards-section').classList.add('active');
    setTimeout(() => loadDeckCards(deckId), 100);
}

// ===== FOLDERS =====
async function loadFolders() {
    const content = document.getElementById('folders-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading folders...</div>';
    
    try {
        const response = await fetch(`${API_URL}/folders`, {
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        allFolders = await response.json();
        
        if (allFolders.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder"></i>
                    <h3>No Folders Yet</h3>
                    <p>Create folders to organize your decks</p>
                </div>
            `;
            return;
        }
        
        displayFolders(allFolders);
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading folders</h3><p>${error.message}</p></div>`;
    }
}

function displayFolders(folders) {
    const content = document.getElementById('folders-content');
    
    let html = '<div class="card-grid">';
    
    folders.forEach(folder => {
        const parent = allFolders.find(f => f.id === folder.parentId);
        const decksInFolder = allDecks.filter(d => d.folderId === folder.id).length;
        
        html += `
            <div class="item-card">
                <div class="item-card-header">
                    <div class="table-icon"><i class="fas fa-folder"></i></div>
                    <div class="item-card-title">${folder.name}</div>
                </div>
                <div class="item-card-meta">
                    <span class="badge badge-blue">
                        <i class="fas fa-layer-group"></i>
                        ${decksInFolder} decks
                    </span>
                    ${parent ? `<span class="badge badge-purple"><i class="fas fa-folder-open"></i> ${parent.name}</span>` : '<span class="badge badge-green"><i class="fas fa-home"></i> Root</span>'}
                </div>
                <div style="margin: 10px 0; font-size: 13px; color: #6b7280;">
                    <i class="fas fa-calendar"></i> Created: ${new Date(folder.createdAt).toLocaleDateString()}
                </div>
                <div class="item-card-actions">
                    <button class="action-btn btn-primary" onclick="editFolder('${folder.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn btn-danger" onclick="deleteFolder('${folder.id}', '${folder.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    content.innerHTML = html;
}

function filterFolders() {
    const search = document.getElementById('folder-search').value.toLowerCase();
    const filtered = allFolders.filter(folder => 
        folder.name.toLowerCase().includes(search)
    );
    displayFolders(filtered);
}

async function deleteFolder(id, name) {
    if (!confirm(`Delete folder "${name}"? Decks in this folder will be moved to root.`)) return;
    
    try {
        const response = await fetch(`${API_URL}/folders/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        showToast('Folder deleted successfully');
        loadFolders();
    } catch (error) {
        showToast('Error deleting folder: ' + error.message, 'error');
    }
}

// ===== AUDIO =====
async function loadAudio() {
    const content = document.getElementById('audio-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading audio files...</div>';
    
    try {
        const response = await fetch(`${API_URL}/audio`, {
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        allAudio = await response.json();
        
        if (allAudio.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-music"></i>
                    <h3>No Audio Files Yet</h3>
                    <p>Upload audio files for your flashcards</p>
                </div>
            `;
            return;
        }
        
        displayAudio(allAudio);
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading audio</h3><p>${error.message}</p></div>`;
    }
}

function displayAudio(audio) {
    const content = document.getElementById('audio-content');
    
    let html = '<div class="card-grid">';
    
    audio.forEach(item => {
        html += `
            <div class="item-card">
                <div class="item-card-header">
                    <div class="table-icon"><i class="fas fa-music"></i></div>
                    <div class="item-card-title">${item.name}</div>
                </div>
                <div class="item-card-meta">
                    <span class="badge badge-purple">
                        <i class="fas fa-file-audio"></i>
                        Audio File
                    </span>
                </div>
                <div style="margin: 10px 0; font-size: 12px; color: #6b7280; word-break: break-all;">
                    <i class="fas fa-link"></i> ${item.uri.substring(0, 60)}...
                </div>
                <div style="margin: 10px 0; font-size: 13px; color: #6b7280;">
                    <i class="fas fa-calendar"></i> ${new Date(item.createdAt).toLocaleDateString()}
                </div>
                <div class="item-card-actions">
                    <button class="action-btn btn-danger" onclick="deleteAudio('${item.id}', '${item.name}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    content.innerHTML = html;
}

function filterAudio() {
    const search = document.getElementById('audio-search').value.toLowerCase();
    const filtered = allAudio.filter(item => 
        item.name.toLowerCase().includes(search)
    );
    displayAudio(filtered);
}

async function deleteAudio(id, name) {
    if (!confirm(`Delete audio "${name}"?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/audio/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        showToast('Audio deleted successfully');
        loadAudio();
    } catch (error) {
        showToast('Error deleting audio: ' + error.message, 'error');
    }
}

// ===== PDFs =====
async function loadPDFs() {
    const content = document.getElementById('pdfs-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading PDF files...</div>';
    
    try {
        const response = await fetch(`${API_URL}/pdfs`, {
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        allPDFs = await response.json();
        
        if (allPDFs.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-pdf"></i>
                    <h3>No PDF Files Yet</h3>
                    <p>Upload PDF files for your flashcards</p>
                </div>
            `;
            return;
        }
        
        displayPDFs(allPDFs);
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading PDFs</h3><p>${error.message}</p></div>`;
    }
}

function displayPDFs(pdfs) {
    const content = document.getElementById('pdfs-content');
    
    let html = '<div class="card-grid">';
    
    pdfs.forEach(item => {
        html += `
            <div class="item-card">
                <div class="item-card-header">
                    <div class="table-icon"><i class="fas fa-file-pdf"></i></div>
                    <div class="item-card-title">${item.name}</div>
                </div>
                <div class="item-card-meta">
                    <span class="badge badge-red">
                        <i class="fas fa-file-pdf"></i>
                        PDF Document
                    </span>
                </div>
                <div style="margin: 10px 0; font-size: 12px; color: #6b7280; word-break: break-all;">
                    <i class="fas fa-link"></i> ${item.uri.substring(0, 60)}...
                </div>
                <div style="margin: 10px 0; font-size: 13px; color: #6b7280;">
                    <i class="fas fa-calendar"></i> ${new Date(item.createdAt).toLocaleDateString()}
                </div>
                <div class="item-card-actions">
                    <button class="action-btn btn-danger" onclick="deletePDF('${item.id}', '${item.name}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    content.innerHTML = html;
}

function filterPDFs() {
    const search = document.getElementById('pdf-search').value.toLowerCase();
    const filtered = allPDFs.filter(item => 
        item.name.toLowerCase().includes(search)
    );
    displayPDFs(filtered);
}

async function deletePDF(id, name) {
    if (!confirm(`Delete PDF "${name}"?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/pdfs/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        showToast('PDF deleted successfully');
        loadPDFs();
    } catch (error) {
        showToast('Error deleting PDF: ' + error.message, 'error');
    }
}

// ===== CARDS =====
async function loadAllCards() {
    const content = document.getElementById('cards-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading cards...</div>';
    
    try {
        if (allDecks.length === 0) {
            await loadDecks();
        }
        
        if (allDecks.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-address-card"></i>
                    <h3>No Cards Yet</h3>
                    <p>Create decks first to add flashcards</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        for (const deck of allDecks) {
            const response = await fetch(`${API_URL}/cards/${deck.id}`, {
                headers: getAuthHeaders()
            });
            if (handleAuthError(response)) return;
            const data = await response.json();
            allCards[deck.id] = data.cards || [];
            
            html += `
                <div style="margin-bottom: 40px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #e5e7eb;">
                        <div class="table-icon"><i class="fas fa-book"></i></div>
                        <h3 style="font-size: 22px; color: #1f2937; margin: 0;">${deck.name}</h3>
                        <span class="badge badge-blue">${allCards[deck.id].length} cards</span>
                    </div>
                    ${allCards[deck.id].length > 0 ? `
                        <div class="card-grid">
                            ${allCards[deck.id].map((card, idx) => `
                                <div class="item-card">
                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 12px; font-weight: 700; color: #667eea; margin-bottom: 5px;">QUESTION</div>
                                        <div style="font-size: 14px; color: #1f2937;">${card.question.substring(0, 100)}${card.question.length > 100 ? '...' : ''}</div>
                                    </div>
                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 12px; font-weight: 700; color: #10b981; margin-bottom: 5px;">ANSWER</div>
                                        <div style="font-size: 14px; color: #1f2937;">${card.answer.substring(0, 100)}${card.answer.length > 100 ? '...' : ''}</div>
                                    </div>
                                    <div style="margin-top: 15px;">
                                        <span class="badge badge-${card.learned ? 'green' : 'blue'}">
                                            <i class="fas fa-${card.learned ? 'check-circle' : 'clock'}"></i>
                                            ${card.learned ? 'Learned' : 'Learning'}
                                        </span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p style="color: #9ca3af; padding: 30px; text-align: center; background: #f9fafb; border-radius: 12px;">No cards in this deck yet</p>'}
                </div>
            `;
        }
        
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading cards</h3><p>${error.message}</p></div>`;
    }
}

async function loadDeckCards(deckId) {
    const deck = allDecks.find(d => d.id === deckId);
    if (!deck) return;
    
    const content = document.getElementById('cards-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading cards...</div>';
    
    try {
        const response = await fetch(`${API_URL}/cards/${deckId}`, {
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        const data = await response.json();
        const cards = data.cards || [];
        
        let html = `
            <div style="margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; color: white;">
                <h3 style="font-size: 24px; margin-bottom: 10px;"><i class="fas fa-book"></i> ${deck.name}</h3>
                <p style="font-size: 14px; opacity: 0.9;">${cards.length} flashcards</p>
            </div>
        `;
        
        if (cards.length > 0) {
            html += '<div class="card-grid">';
            cards.forEach((card, idx) => {
                html += `
                    <div class="item-card">
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; font-weight: 700; color: #667eea; margin-bottom: 5px;">QUESTION</div>
                            <div style="font-size: 14px; color: #1f2937;">${card.question}</div>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; font-weight: 700; color: #10b981; margin-bottom: 5px;">ANSWER</div>
                            <div style="font-size: 14px; color: #1f2937;">${card.answer}</div>
                        </div>
                        <div style="margin-top: 15px;">
                            <span class="badge badge-${card.learned ? 'green' : 'blue'}">
                                <i class="fas fa-${card.learned ? 'check-circle' : 'clock'}"></i>
                                ${card.learned ? 'Learned' : 'Learning'}
                            </span>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += '<p style="color: #9ca3af; padding: 40px; text-align: center; background: #f9fafb; border-radius: 12px;"><i class="fas fa-inbox"></i><br><br>No cards in this deck yet</p>';
        }
        
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading cards</h3><p>${error.message}</p></div>`;
    }
}

// ===== MODALS =====
function openAddModal(type) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    if (type === 'deck') {
        title.innerHTML = '<i class="fas fa-layer-group"></i> Add New Deck';
        body.innerHTML = `
            <form onsubmit="saveDeck(event)">
                <div class="form-group">
                    <label><i class="fas fa-heading"></i> Deck Name</label>
                    <input type="text" id="deck-name" placeholder="Enter deck name" required>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-icons"></i> Icon</label>
                    <input type="text" id="deck-icon" value="Book" placeholder="Icon name">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Type</label>
                    <select id="deck-type">
                        <option value="csv">CSV (Import from file)</option>
                        <option value="pdf">PDF (Attached document)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-folder"></i> Folder (Optional)</label>
                    <select id="deck-folder">
                        <option value="">Root / No Folder</option>
                        ${allFolders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-save"></i> Save Deck
                </button>
            </form>
        `;
    } else if (type === 'folder') {
        title.innerHTML = '<i class="fas fa-folder"></i> Add New Folder';
        body.innerHTML = `
            <form onsubmit="saveFolder(event)">
                <div class="form-group">
                    <label><i class="fas fa-heading"></i> Folder Name</label>
                    <input type="text" id="folder-name" placeholder="Enter folder name" required>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-folder-open"></i> Parent Folder (Optional)</label>
                    <select id="folder-parent">
                        <option value="">Root / No Parent</option>
                        ${allFolders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-save"></i> Save Folder
                </button>
            </form>
        `;
    } else if (type === 'card') {
        title.innerHTML = '<i class="fas fa-address-card"></i> Add New Card';
        body.innerHTML = `
            <form onsubmit="saveCard(event)">
                <div class="form-group">
                    <label><i class="fas fa-layer-group"></i> Select Deck</label>
                    <select id="card-deck" required>
                        <option value="">Choose a deck...</option>
                        ${allDecks.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-question-circle"></i> Question</label>
                    <textarea id="card-question" placeholder="Enter question" required></textarea>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-check-circle"></i> Answer</label>
                    <textarea id="card-answer" placeholder="Enter answer" required></textarea>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-save"></i> Save Card
                </button>
            </form>
        `;
    }
    
    modal.classList.add('active');
}

function openUploadModal(type) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    if (type === 'csv') {
        title.innerHTML = '<i class="fas fa-file-csv"></i> Import CSV File';
        body.innerHTML = `
            <div class="upload-area" onclick="document.getElementById('csvFileInput').click()" ondragover="event.preventDefault(); this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="handleCSVDrop(event)">
                <div class="upload-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="upload-text">Click to upload or drag & drop</div>
                <div class="upload-hint">CSV file with question and answer columns</div>
            </div>
            <input type="file" id="csvFileInput" accept=".csv" onchange="handleCSVUpload(event)" style="display: none;">
            
            <div class="form-group">
                <label><i class="fas fa-heading"></i> Deck Name</label>
                <input type="text" id="csv-deck-name" placeholder="Name for this deck" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-folder"></i> Folder (Optional)</label>
                <select id="csv-folder">
                    <option value="">Root / No Folder</option>
                    ${allFolders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                </select>
            </div>
            <button class="btn-primary" onclick="processCSVUpload()" style="width: 100%; margin-top: 10px;" disabled id="csv-upload-btn">
                <i class="fas fa-upload"></i> Import CSV
            </button>
        `;
    } else if (type === 'audio' || type === 'pdf') {
        const fileType = type === 'audio' ? 'Audio' : 'PDF';
        const icon = type === 'audio' ? 'music' : 'file-pdf';
        const accept = type === 'audio' ? 'audio/*' : '.pdf';
        
        title.innerHTML = `<i class="fas fa-${icon}"></i> Upload ${fileType} File`;
        body.innerHTML = `
            <div class="upload-area" onclick="document.getElementById('uploadFileInput').click()">
                <div class="upload-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="upload-text">Click to upload ${fileType.toLowerCase()} file</div>
                <div class="upload-hint">Select ${fileType.toLowerCase()} file from your device</div>
            </div>
            <input type="file" id="uploadFileInput" accept="${accept}" onchange="handleFileUpload(event, '${type}')" style="display: none;">
            
            <div class="form-group">
                <label><i class="fas fa-heading"></i> File Name</label>
                <input type="text" id="upload-file-name" placeholder="Name for this file" required>
            </div>
            <button class="btn-primary" onclick="processFileUpload('${type}')" style="width: 100%; margin-top: 10px;" disabled id="file-upload-btn">
                <i class="fas fa-upload"></i> Upload ${fileType}
            </button>
        `;
    }
    
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ===== SAVE FUNCTIONS =====
async function saveDeck(event) {
    event.preventDefault();
    
    const deck = {
        id: Date.now().toString(),
        name: document.getElementById('deck-name').value,
        icon: document.getElementById('deck-icon').value,
        type: document.getElementById('deck-type').value,
        folderId: document.getElementById('deck-folder').value || null,
        uri: '',
        totalCards: 0,
        learnedCards: 0,
        createdAt: new Date().toISOString()
    };
    
    try {
        const response = await fetch(`${API_URL}/decks`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(deck)
        });
        if (handleAuthError(response)) return;
        
        closeModal();
        showToast('Deck created successfully');
        loadDecks();
    } catch (error) {
        showToast('Error creating deck: ' + error.message, 'error');
    }
}

async function saveFolder(event) {
    event.preventDefault();
    
    const folder = {
        id: Date.now().toString(),
        name: document.getElementById('folder-name').value,
        parentId: document.getElementById('folder-parent').value || null,
        createdAt: new Date().toISOString()
    };
    
    try {
        const response = await fetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(folder)
        });
        if (handleAuthError(response)) return;
        
        closeModal();
        showToast('Folder created successfully');
        loadFolders();
    } catch (error) {
        showToast('Error creating folder: ' + error.message, 'error');
    }
}

async function saveCard(event) {
    event.preventDefault();
    
    const deckId = document.getElementById('card-deck').value;
    const question = document.getElementById('card-question').value;
    const answer = document.getElementById('card-answer').value;
    
    const card = {
        id: Date.now().toString(),
        question,
        answer,
        learned: false
    };
    
    try {
        // Get current cards
        const response = await fetch(`${API_URL}/cards/${deckId}`, {
            headers: getAuthHeaders()
        });
        if (handleAuthError(response)) return;
        const data = await response.json();
        const cards = data.cards || [];
        
        // Add new card
        cards.push(card);
        
        // Update cards
        const cardsResponse = await fetch(`${API_URL}/cards/${deckId}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ cards })
        });
        if (handleAuthError(cardsResponse)) return;
        
        // Update deck card count
        const deck = allDecks.find(d => d.id === deckId);
        if (deck) {
            deck.totalCards = cards.length;
            const deckResponse = await fetch(`${API_URL}/decks/${deckId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(deck)
            });
            if (handleAuthError(deckResponse)) return;
        }
        
        closeModal();
        showToast('Card created successfully');
        loadAllCards();
    } catch (error) {
        showToast('Error creating card: ' + error.message, 'error');
    }
}

// ===== CSV UPLOAD =====
let csvData = null;

function handleCSVDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        processCSVFile(file);
    } else {
        showToast('Please drop a CSV file', 'error');
    }
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (file) {
        processCSVFile(file);
    }
}

function processCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            showToast('CSV file is empty', 'error');
            return;
        }
        
        const cards = [];
        
        // Check if first line looks like a header (contains "question" or "front")
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('question') || firstLine.includes('front') || firstLine.includes('answer') || firstLine.includes('back');
        const startIndex = hasHeader ? 1 : 0;
        
        if (lines.length <= startIndex) {
            showToast('CSV file has no data rows', 'error');
            return;
        }
        
        for (let i = startIndex; i < lines.length; i++) {
            // Simple CSV parsing - split by comma
            // For better parsing with quotes, we'd need a proper CSV library
            const values = lines[i].split(',').map(v => v.trim());
            
            if (values.length >= 2 && values[0] && values[1]) {
                cards.push({
                    id: `${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
                    question: values[0],
                    answer: values[1],
                    learned: false
                });
            }
        }
        
        if (cards.length === 0) {
            showToast('No valid card data found in CSV. Format: question,answer', 'error');
            return;
        }
        
        csvData = cards;
        document.getElementById('csv-upload-btn').disabled = false;
        document.getElementById('csv-deck-name').value = file.name.replace('.csv', '');
        showToast(`Loaded ${cards.length} cards from CSV`, 'success');
        console.log('Parsed cards:', cards); // Debug log
    };
    reader.readAsText(file);
}

async function processCSVUpload() {
    if (!csvData || csvData.length === 0) {
        showToast('Please select a CSV file first', 'error');
        return;
    }
    
    const deckName = document.getElementById('csv-deck-name').value.trim();
    const folderId = document.getElementById('csv-folder').value || null;
    
    if (!deckName) {
        showToast('Please enter a deck name', 'error');
        return;
    }
    
    try {
        console.log('Creating deck with', csvData.length, 'cards');
        
        // Create deck
        const deck = {
            id: Date.now().toString(),
            name: deckName,
            icon: 'FileSpreadsheet',
            type: 'csv',
            folderId,
            uri: '',
            totalCards: csvData.length,
            learnedCards: 0,
            createdAt: new Date().toISOString()
        };
        
        const deckResponse = await fetch(`${API_URL}/decks`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(deck)
        });
        if (handleAuthError(deckResponse)) return;
        
        if (!deckResponse.ok) {
            throw new Error('Failed to create deck: ' + deckResponse.statusText);
        }
        
        console.log('Deck created, now adding cards:', csvData);
        
        // Add cards
        const cardsResponse = await fetch(`${API_URL}/cards/${deck.id}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ cards: csvData })
        });
        if (handleAuthError(cardsResponse)) return;
        
        if (!cardsResponse.ok) {
            throw new Error('Failed to add cards: ' + cardsResponse.statusText);
        }
        
        console.log('Cards added successfully');
        
        closeModal();
        showToast(`Successfully imported ${csvData.length} cards!`, 'success');
        csvData = null;
        await loadDecks();
    } catch (error) {
        console.error('CSV import error:', error);
        showToast('Error importing CSV: ' + error.message, 'error');
    }
}

// ===== FILE UPLOAD =====
let uploadFile = null;

function handleFileUpload(event, type) {
    uploadFile = event.target.files[0];
    if (uploadFile) {
        document.getElementById('upload-file-name').value = uploadFile.name.replace(/\.[^/.]+$/, '');
        document.getElementById('file-upload-btn').disabled = false;
    }
}

async function processFileUpload(type) {
    if (!uploadFile) {
        showToast('Please select a file first', 'error');
        return;
    }
    
    const name = document.getElementById('upload-file-name').value;
    if (!name) {
        showToast('Please enter a file name', 'error');
        return;
    }
    
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const uri = e.target.result;
            
            const fileData = {
                id: Date.now().toString(),
                name,
                uri,
                createdAt: new Date().toISOString()
            };
            
            const endpoint = type === 'audio' ? 'audio' : 'pdfs';
            const response = await fetch(`${API_URL}/${endpoint}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(fileData)
            });
            if (handleAuthError(response)) return;
            
            closeModal();
            showToast(`${type === 'audio' ? 'Audio' : 'PDF'} uploaded successfully`, 'success');
            uploadFile = null;
            
            if (type === 'audio') loadAudio();
            else loadPDFs();
        };
        
        reader.readAsDataURL(uploadFile);
    } catch (error) {
        showToast(`Error uploading file: ${error.message}`, 'error');
    }
}

// ===== EDIT FUNCTIONS =====
function editDeck(id) {
    const deck = allDecks.find(d => d.id === id);
    if (!deck) return;
    
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.innerHTML = '<i class="fas fa-edit"></i> Edit Deck';
    body.innerHTML = `
        <form onsubmit="updateDeck(event, '${id}')">
            <div class="form-group">
                <label><i class="fas fa-heading"></i> Deck Name</label>
                <input type="text" id="edit-deck-name" value="${deck.name}" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-icons"></i> Icon</label>
                <input type="text" id="edit-deck-icon" value="${deck.icon || 'Book'}">
            </div>
            <div class="form-group">
                <label><i class="fas fa-folder"></i> Folder</label>
                <select id="edit-deck-folder">
                    <option value="">Root / No Folder</option>
                    ${allFolders.map(f => `<option value="${f.id}" ${deck.folderId === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                <i class="fas fa-save"></i> Update Deck
            </button>
        </form>
    `;
    
    modal.classList.add('active');
}

async function updateDeck(event, id) {
    event.preventDefault();
    
    const deck = allDecks.find(d => d.id === id);
    if (!deck) return;
    
    deck.name = document.getElementById('edit-deck-name').value;
    deck.icon = document.getElementById('edit-deck-icon').value;
    deck.folderId = document.getElementById('edit-deck-folder').value || null;
    
    try {
        const response = await fetch(`${API_URL}/decks/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(deck)
        });
        if (handleAuthError(response)) return;
        
        closeModal();
        showToast('Deck updated successfully');
        loadDecks();
    } catch (error) {
        showToast('Error updating deck: ' + error.message, 'error');
    }
}

function editFolder(id) {
    const folder = allFolders.find(f => f.id === id);
    if (!folder) return;
    
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.innerHTML = '<i class="fas fa-edit"></i> Edit Folder';
    body.innerHTML = `
        <form onsubmit="updateFolder(event, '${id}')">
            <div class="form-group">
                <label><i class="fas fa-heading"></i> Folder Name</label>
                <input type="text" id="edit-folder-name" value="${folder.name}" required>
            </div>
            <div class="form-group">
                <label><i class="fas fa-folder-open"></i> Parent Folder</label>
                <select id="edit-folder-parent">
                    <option value="">Root / No Parent</option>
                    ${allFolders.filter(f => f.id !== id).map(f => `<option value="${f.id}" ${folder.parentId === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">
                <i class="fas fa-save"></i> Update Folder
            </button>
        </form>
    `;
    
    modal.classList.add('active');
}

async function updateFolder(event, id) {
    event.preventDefault();
    
    const folder = allFolders.find(f => f.id === id);
    if (!folder) return;
    
    folder.name = document.getElementById('edit-folder-name').value;
    folder.parentId = document.getElementById('edit-folder-parent').value || null;
    
    try {
        const response = await fetch(`${API_URL}/folders/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(folder)
        });
        if (handleAuthError(response)) return;
        
        closeModal();
        showToast('Folder updated successfully');
        loadFolders();
    } catch (error) {
        showToast('Error updating folder: ' + error.message, 'error');
    }
}

// Logout function
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

// Load user info
function loadUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.email) {
        document.getElementById('userEmail').textContent = user.email;
    }
}

// Initialize
checkAuth();
loadUserInfo();
checkConnection();
loadDecks();
setInterval(checkConnection, 10000);
