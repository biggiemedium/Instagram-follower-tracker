class InstagramAnalyzer {
    constructor() {
        this.followingData = null;
        this.followersData = null;
        this.processedData = {
            following: [],
            followers: [],
            mutualFollows: [],
            followingNotFollowingBack: [],
            followersNotFollowingBack: [],
            recentFollows: [],
            oldestFollows: [],
            timeline: []
        };
        this.filters = {
            timeRange: 'all',
            relationship: 'all',
            sortBy: 'recent',
            searchQuery: ''
        };
    }

    // Load and parse following JSON data
    loadFollowingData(jsonData) {
        try {
            this.followingData = jsonData;
            this.processedData.following = this.extractUserData(jsonData, 'relationships_following');
            console.log(`Loaded ${this.processedData.following.length} following accounts`);
            this.analyzeData();
            return true;
        } catch (error) {
            console.error('Error loading following data:', error);
            return false;
        }
    }

    // Load and parse followers JSON data
    loadFollowersData(jsonData) {
        try {
            this.followersData = jsonData;
            this.processedData.followers = this.extractUserData(jsonData);
            console.log(`Loaded ${this.processedData.followers.length} followers`);
            this.analyzeData();
            return true;
        } catch (error) {
            console.error('Error loading followers data:', error);
            return false;
        }
    }

    // Extract user data from JSON with timestamps and URLs
    extractUserData(data, key = null) {
        let users = [];
        let sourceArray = key ? data[key] : data;

        if (!Array.isArray(sourceArray)) {
            console.warn('Data is not an array, attempting to extract...');
            return [];
        }

        sourceArray.forEach(item => {
            if (item.string_list_data && item.string_list_data.length > 0) {
                const userData = item.string_list_data[0];
                users.push({
                    username: userData.value,
                    url: userData.href,
                    timestamp: userData.timestamp,
                    followDate: new Date(userData.timestamp * 1000),
                    followDateString: new Date(userData.timestamp * 1000).toLocaleDateString(),
                    daysSinceFollow: Math.floor((Date.now() - (userData.timestamp * 1000)) / (1000 * 60 * 60 * 24))
                });
            }
        });

        // Sort by most recent by default
        return users.sort((a, b) => b.timestamp - a.timestamp);
    }

    // Analyze relationships between following and followers
    analyzeData() {
        if (!this.processedData.following.length || !this.processedData.followers.length) {
            return;
        }

        const followingUsernames = new Set(this.processedData.following.map(u => u.username));
        const followersUsernames = new Set(this.processedData.followers.map(u => u.username));

        // Find mutual follows (people you follow who also follow you)
        this.processedData.mutualFollows = this.processedData.following.filter(user =>
            followersUsernames.has(user.username)
        ).map(user => ({
            ...user,
            relationship: 'mutual',
            followerData: this.processedData.followers.find(f => f.username === user.username)
        }));

        // Find people you follow who don't follow you back
        this.processedData.followingNotFollowingBack = this.processedData.following.filter(user =>
            !followersUsernames.has(user.username)
        ).map(user => ({
            ...user,
            relationship: 'following_only'
        }));

        // Find followers who you don't follow back
        this.processedData.followersNotFollowingBack = this.processedData.followers.filter(user =>
            !followingUsernames.has(user.username)
        ).map(user => ({
            ...user,
            relationship: 'follower_only'
        }));

        // Analyze follow patterns
        this.analyzeFollowPatterns();
        this.generateTimeline();

        console.log('Analysis complete:', {
            totalFollowing: this.processedData.following.length,
            totalFollowers: this.processedData.followers.length,
            mutualFollows: this.processedData.mutualFollows.length,
            followingNotFollowingBack: this.processedData.followingNotFollowingBack.length,
            followersNotFollowingBack: this.processedData.followersNotFollowingBack.length
        });
    }

    // Analyze follow patterns and timing
    analyzeFollowPatterns() {
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        // Recent follows (last week)
        this.processedData.recentFollows = [
            ...this.processedData.following.filter(user => (now - user.timestamp * 1000) <= oneWeek),
            ...this.processedData.followers.filter(user => (now - user.timestamp * 1000) <= oneWeek)
        ].sort((a, b) => b.timestamp - a.timestamp);

        // Oldest follows
        this.processedData.oldestFollows = [
            ...this.processedData.following,
            ...this.processedData.followers
        ].sort((a, b) => a.timestamp - b.timestamp).slice(0, 20);
    }

    // Generate timeline of activities
    generateTimeline() {
        const allActivities = [
            ...this.processedData.following.map(user => ({
                ...user,
                type: 'following',
                action: 'Started following'
            })),
            ...this.processedData.followers.map(user => ({
                ...user,
                type: 'follower',
                action: 'Started following you'
            }))
        ];

        // Group by date
        const groupedByDate = {};
        allActivities.forEach(activity => {
            const dateKey = activity.followDateString;
            if (!groupedByDate[dateKey]) {
                groupedByDate[dateKey] = [];
            }
            groupedByDate[dateKey].push(activity);
        });

        // Convert to timeline format
        this.processedData.timeline = Object.entries(groupedByDate)
            .map(([date, activities]) => ({
                date,
                activities: activities.sort((a, b) => b.timestamp - a.timestamp),
                count: activities.length
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 50); // Limit to last 50 days with activity
    }

    // Get filtered data based on current filters
    getFilteredData() {
        let data = [];
        const now = Date.now();

        // Select data based on relationship filter
        switch (this.filters.relationship) {
            case 'mutual':
                data = [...this.processedData.mutualFollows];
                break;
            case 'following_only':
                data = [...this.processedData.followingNotFollowingBack];
                break;
            case 'follower_only':
                data = [...this.processedData.followersNotFollowingBack];
                break;
            case 'following':
                data = [...this.processedData.following];
                break;
            case 'followers':
                data = [...this.processedData.followers];
                break;
            default:
                data = [
                    ...this.processedData.following.map(u => ({...u, type: 'following'})),
                    ...this.processedData.followers.map(u => ({...u, type: 'followers'}))
                ];
        }

        // Apply time range filter
        if (this.filters.timeRange !== 'all') {
            const timeRanges = {
                'week': 7 * 24 * 60 * 60 * 1000,
                'month': 30 * 24 * 60 * 60 * 1000,
                '3months': 90 * 24 * 60 * 60 * 1000,
                'year': 365 * 24 * 60 * 60 * 1000
            };

            const cutoff = now - timeRanges[this.filters.timeRange];
            data = data.filter(user => user.timestamp * 1000 >= cutoff);
        }

        // Apply search filter
        if (this.filters.searchQuery) {
            const query = this.filters.searchQuery.toLowerCase();
            data = data.filter(user =>
                user.username.toLowerCase().includes(query)
            );
        }

        // Apply sorting
        switch (this.filters.sortBy) {
            case 'recent':
                data.sort((a, b) => b.timestamp - a.timestamp);
                break;
            case 'oldest':
                data.sort((a, b) => a.timestamp - b.timestamp);
                break;
            case 'alphabetical':
                data.sort((a, b) => a.username.localeCompare(b.username));
                break;
        }

        return data;
    }

    // Get statistics summary
    getStatistics() {
        const stats = {
            totalFollowing: this.processedData.following.length,
            totalFollowers: this.processedData.followers.length,
            mutualFollows: this.processedData.mutualFollows.length,
            followingNotFollowingBack: this.processedData.followingNotFollowingBack.length,
            followersNotFollowingBack: this.processedData.followersNotFollowingBack.length,
            followRatio: this.processedData.followers.length > 0 ?
                (this.processedData.following.length / this.processedData.followers.length).toFixed(2) : 0,
            mutualFollowRate: this.processedData.following.length > 0 ?
                ((this.processedData.mutualFollows.length / this.processedData.following.length) * 100).toFixed(1) : 0
        };

        // Time-based statistics
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const oneMonth = 30 * 24 * 60 * 60 * 1000;

        stats.recentFollowing = this.processedData.following.filter(u =>
            (now - u.timestamp * 1000) <= oneWeek
        ).length;

        stats.recentFollowers = this.processedData.followers.filter(u =>
            (now - u.timestamp * 1000) <= oneWeek
        ).length;

        stats.monthlyFollowing = this.processedData.following.filter(u =>
            (now - u.timestamp * 1000) <= oneMonth
        ).length;

        stats.monthlyFollowers = this.processedData.followers.filter(u =>
            (now - u.timestamp * 1000) <= oneMonth
        ).length;

        return stats;
    }

    // Update filters
    updateFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
    }

    // Clear all filters
    clearFilters() {
        this.filters = {
            timeRange: 'all',
            relationship: 'all',
            sortBy: 'recent',
            searchQuery: ''
        };
    }

    // Export filtered data to CSV
    exportToCSV(filename = 'instagram_analysis.csv') {
        const data = this.getFilteredData();
        if (data.length === 0) {
            console.warn('No data to export');
            return;
        }

        const headers = ['Username', 'URL', 'Follow Date', 'Days Since Follow', 'Relationship Type'];
        const csvContent = [
            headers.join(','),
            ...data.map(user => [
                user.username,
                user.url,
                user.followDateString,
                user.daysSinceFollow,
                user.relationship || user.type || 'unknown'
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Get users who might be inactive (haven't followed/been followed recently)
    getInactiveAnalysis() {
        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

        const oldFollowing = this.processedData.following.filter(user =>
            user.timestamp * 1000 < threeMonthsAgo
        );

        const oldFollowers = this.processedData.followers.filter(user =>
            user.timestamp * 1000 < threeMonthsAgo
        );

        return {
            oldFollowing: oldFollowing.length,
            oldFollowers: oldFollowers.length,
            oldFollowingList: oldFollowing.slice(0, 50),
            oldFollowersList: oldFollowers.slice(0, 50)
        };
    }

    // Find potential fake or spam accounts
    findSuspiciousAccounts() {
        const suspicious = [];

        const suspiciousPatterns = [
            /^[a-z]+\d+$/,
            /^\d+[a-z]+$/,
            /^[a-z]+_\d+$/,
            /_+$/,
            /^[a-z]{1,3}\d{4,}$/
        ];

        this.processedData.followers.forEach(user => {
            const username = user.username.toLowerCase();
            let suspicionReasons = [];

            suspiciousPatterns.forEach((pattern, index) => {
                if (pattern.test(username)) {
                    suspicionReasons.push(`Pattern ${index + 1}`);
                }
            });

            if (user.daysSinceFollow < 1) {
                suspicionReasons.push('Very recent follow');
            }

            if (suspicionReasons.length > 0) {
                suspicious.push({
                    ...user,
                    suspicionReasons
                });
            }
        });

        return suspicious.sort((a, b) => b.suspicionReasons.length - a.suspicionReasons.length);
    }

    // Generate a comprehensive report
    generateReport() {
        const stats = this.getStatistics();
        const inactive = this.getInactiveAnalysis();
        const suspicious = this.findSuspiciousAccounts();

        return {
            summary: stats,
            relationships: {
                mutual: this.processedData.mutualFollows.slice(0, 10),
                followingOnly: this.processedData.followingNotFollowingBack.slice(0, 10),
                followersOnly: this.processedData.followersNotFollowingBack.slice(0, 10)
            },
            activity: {
                recentFollows: this.processedData.recentFollows,
                oldestFollows: this.processedData.oldestFollows,
                timeline: this.processedData.timeline
            },
            insights: {
                inactive,
                suspicious: suspicious.slice(0, 20)
            }
        };
    }
}

// Helper functions for UI integration
function formatUserForDisplay(user) {
    return {
        username: user.username,
        url: user.url,
        followDate: user.followDateString,
        daysAgo: user.daysSinceFollow,
        relationship: user.relationship || user.type || 'unknown',
        profileLink: `<a href="${user.url}" target="_blank" class="profile-link">${user.username}</a>`
    };
}

function createUserListHTML(users, maxItems = 100) {
    if (!users || users.length === 0) {
        return '<div class="user-item"><div class="user-info">No users found</div></div>';
    }

    return users.slice(0, maxItems).map(user => {
        const formatted = formatUserForDisplay(user);
        return `
            <div class="user-item" data-username="${user.username}">
                <div class="user-info">
                    <a href="${user.url}" target="_blank" class="username">${user.username}</a>
                    <span class="follow-date">${formatted.daysAgo} days ago</span>
                </div>
                <div class="user-meta">
                    <span class="relationship-type ${formatted.relationship}">${formatted.relationship.replace('_', ' ')}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Global variables
let followersData = null;
let followingData = null;
let currentTab = 'overview';

// Initialize global analyzer instance
window.instagramAnalyzer = new InstagramAnalyzer();

// UI Functions
function initializeFileHandling() {
    const followersZone = document.getElementById('followersZone');
    const followingZone = document.getElementById('followingZone');
    const followersFile = document.getElementById('followersFile');
    const followingFile = document.getElementById('followingFile');

    setupDropZone(followersZone, 'followers');
    setupDropZone(followingZone, 'following');

    followersFile.addEventListener('change', (e) => handleFileSelect(e, 'followers'));
    followingFile.addEventListener('change', (e) => handleFileSelect(e, 'following'));
}

function setupDropZone(dropZone, type) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => handleDrop(e, type), false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e, type) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0], type);
    }
}

function handleFileSelect(e, type) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0], type);
    }
}

function processFile(file, type) {
    if (!file.name.toLowerCase().endsWith('.json')) {
        alert('Please select a JSON file');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (type === 'followers') {
                followersData = data;
                window.instagramAnalyzer.loadFollowersData(data);
                updateDropZoneSuccess(document.getElementById('followersZone'), file.name, '👥');
            } else {
                followingData = data;
                window.instagramAnalyzer.loadFollowingData(data);
                updateDropZoneSuccess(document.getElementById('followingZone'), file.name, '➡️');
            }

            checkAnalysisReady();
        } catch (error) {
            alert(`Error parsing ${type} file: ${error.message}`);
        }
    };

    reader.readAsText(file);
}

function updateDropZoneSuccess(dropZone, fileName, icon) {
    dropZone.classList.add('loaded');
    const content = dropZone.querySelector('.drop-zone-content');
    content.innerHTML = `
        <div class="file-icon">${icon}</div>
        <h3>File Loaded</h3>
        <p><strong>${fileName}</strong><br>Ready for analysis</p>
    `;
}

function checkAnalysisReady() {
    if (followersData && followingData) {
        document.getElementById('loading').classList.add('show');

        setTimeout(() => {
            document.getElementById('loading').classList.remove('show');
            document.getElementById('statsOverview').style.display = 'grid';
            document.getElementById('controlsSection').style.display = 'block';
            document.getElementById('analysisSection').style.display = 'block';

            updateStatistics();
            displayAnalysis();
        }, 2000);
    }
}

function updateStatistics() {
    const stats = window.instagramAnalyzer.getStatistics();

    document.getElementById('totalFollowing').textContent = stats.totalFollowing;
    document.getElementById('totalFollowers').textContent = stats.totalFollowers;
    document.getElementById('mutualCount').textContent = stats.mutualFollows;
    document.getElementById('followRatio').textContent = stats.followRatio;
    document.getElementById('notFollowingBack').textContent = stats.followingNotFollowingBack;
    document.getElementById('dontFollowBack').textContent = stats.followersNotFollowingBack;
}

function applyFilters() {
    const filters = {
        relationship: document.getElementById('relationshipFilter').value,
        timeRange: document.getElementById('timeFilter').value,
        sortBy: document.getElementById('sortFilter').value,
        searchQuery: document.getElementById('searchFilter').value
    };

    window.instagramAnalyzer.updateFilters(filters);
    displayAnalysis();
}

function clearFilters() {
    window.instagramAnalyzer.clearFilters();

    // Reset form elements
    document.getElementById('relationshipFilter').value = 'all';
    document.getElementById('timeFilter').value = 'all';
    document.getElementById('sortFilter').value = 'recent';
    document.getElementById('searchFilter').value = '';

    displayAnalysis();
}

function displayAnalysis() {
    const data = window.instagramAnalyzer.getFilteredData();
    document.getElementById('filteredCount').textContent = data.length;

    if (currentTab === 'overview') {
        displayOverview();
    } else if (currentTab === 'relationships') {
        displayRelationships();
    } else if (currentTab === 'activity') {
        displayActivity();
    } else if (currentTab === 'insights') {
        displayInsights();
    } else if (currentTab === 'timeline') {
        displayTimeline();
    }
}

function displayOverview() {
    const analyzer = window.instagramAnalyzer;
    const container = document.getElementById('overviewResults');

    container.innerHTML = `
        <div class="result-card">
            <h3>🤝 Mutual Follows <span class="count">${analyzer.processedData.mutualFollows.length}</span></h3>
            <div class="description">People who follow you and you follow back</div>
            <div class="user-list">
                ${createUserListHTML(analyzer.processedData.mutualFollows.slice(0, 50))}
            </div>
        </div>
        <div class="result-card">
            <h3>➡️ You Follow Only <span class="count">${analyzer.processedData.followingNotFollowingBack.length}</span></h3>
            <div class="description">People you follow who don't follow you back</div>
            <div class="user-list">
                ${createUserListHTML(analyzer.processedData.followingNotFollowingBack.slice(0, 50))}
            </div>
        </div>
        <div class="result-card">
            <h3>⬅️ They Follow Only <span class="count">${analyzer.processedData.followersNotFollowingBack.length}</span></h3>
            <div class="description">People who follow you but you don't follow back</div>
            <div class="user-list">
                ${createUserListHTML(analyzer.processedData.followersNotFollowingBack.slice(0, 50))}
            </div>
        </div>
    `;
}

function displayRelationships() {
    const report = window.instagramAnalyzer.generateReport();
    const container = document.getElementById('relationshipResults');

    container.innerHTML = `
        <div class="result-card">
            <h3>📊 Relationship Summary</h3>
            <div class="count">${report.summary.mutualFollowRate}%</div>
            <div class="description">
                <p><strong>Mutual Follow Rate:</strong> ${report.summary.mutualFollowRate}%</p>
                <p><strong>Follow Ratio:</strong> ${report.summary.followRatio}</p>
                <p><strong>Total Connections:</strong> ${report.summary.totalFollowing + report.summary.totalFollowers}</p>
            </div>
        </div>
        <div class="result-card">
            <h3>🔄 Most Recent Mutual</h3>
            <div class="description">Your newest mutual connections</div>
            <div class="user-list">
                ${createUserListHTML(report.relationships.mutual)}
            </div>
        </div>
        <div class="result-card">
            <h3>📈 Growth Insights</h3>
            <div class="description">
                <p><strong>Following Growth:</strong> ${report.summary.recentFollowing} this week</p>
                <p><strong>Follower Growth:</strong> ${report.summary.recentFollowers} this week</p>
                <p><strong>Net Growth:</strong> ${report.summary.recentFollowers - report.summary.recentFollowing} this week</p>
            </div>
        </div>
    `;
}

function displayActivity() {
    const report = window.instagramAnalyzer.generateReport();
    const stats = window.instagramAnalyzer.getStatistics();
    const container = document.getElementById('activityResults');

    container.innerHTML = `
        <div class="result-card">
            <h3>📅 Recent Activity (7 days)</h3>
            <div class="count">${stats.recentFollowing + stats.recentFollowers}</div>
            <div class="description">
                <p>Recent Following: ${stats.recentFollowing}</p>
                <p>Recent Followers: ${stats.recentFollowers}</p>
            </div>
            <div class="user-list">
                ${createUserListHTML(report.activity.recentFollows)}
            </div>
        </div>
        <div class="result-card">
            <h3>📈 Monthly Activity</h3>
            <div class="count">${stats.monthlyFollowing + stats.monthlyFollowers}</div>
            <div class="description">
                <p>Monthly Following: ${stats.monthlyFollowing}</p>
                <p>Monthly Followers: ${stats.monthlyFollowers}</p>
            </div>
        </div>
        <div class="result-card">
            <h3>🕒 Oldest Connections</h3>
            <div class="description">Your longest-standing connections</div>
            <div class="user-list">
                ${createUserListHTML(report.activity.oldestFollows)}
            </div>
        </div>
    `;
}

function displayInsights() {
    const report = window.instagramAnalyzer.generateReport();
    const container = document.getElementById('insightResults');

    container.innerHTML = `
        <div class="result-card">
            <h3>💤 Inactive Accounts</h3>
            <div class="count">${report.insights.inactive.oldFollowing + report.insights.inactive.oldFollowers}</div>
            <div class="description">Accounts with no recent activity (3+ months)</div>
            <div class="user-list">
                ${createUserListHTML([...report.insights.inactive.oldFollowingList, ...report.insights.inactive.oldFollowersList])}
            </div>
        </div>
        <div class="result-card">
            <h3>🤔 Suspicious Accounts</h3>
            <div class="count">${report.insights.suspicious.length}</div>
            <div class="description">Accounts that might be fake or spam</div>
            <div class="user-list">
                ${createUserListHTML(report.insights.suspicious)}
            </div>
        </div>
        <div class="result-card">
            <h3>🔍 Account Patterns</h3>
            <div class="description">Analysis of username patterns and behaviors</div>
            <div class="user-list">
                ${report.insights.suspicious.length > 0 ?
        report.insights.suspicious.slice(0, 10).map(user => `
                        <div class="user-item">
                            <div class="user-info">
                                <a href="${user.url}" target="_blank" class="username">${user.username}</a>
                                <span class="follow-date">Reasons: ${user.suspicionReasons.join(', ')}</span>
                            </div>
                        </div>
                    `).join('') :
        '<div class="user-item"><div class="user-info">No suspicious patterns detected</div></div>'
    }
            </div>
        </div>
    `;
}

function displayTimeline() {
    const report = window.instagramAnalyzer.generateReport();
    const container = document.getElementById('timelineResults');

    if (!report.activity.timeline || report.activity.timeline.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No timeline data available</h3></div>';
        return;
    }

    container.innerHTML = report.activity.timeline.map(day => `
        <div class="timeline-item">
            <div class="timeline-date">${day.date}</div>
            <div class="timeline-content">
                <h4>${day.count} activities</h4>
                <p>${day.activities.map(a => `${a.action} @${a.username}`).slice(0, 3).join(', ')}${day.activities.length > 3 ? '...' : ''}</p>
            </div>
        </div>
    `).join('');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    currentTab = tabName;
    displayAnalysis();
}

function exportData() {
    window.instagramAnalyzer.exportToCSV('instagram_analysis.csv');
}

function generateDetailedReport() {
    const report = window.instagramAnalyzer.generateReport();
    console.log('Detailed Report:', report);

    // Create a downloadable JSON report
    const reportBlob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(reportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'instagram_detailed_report.json';
    a.click();
    window.URL.revokeObjectURL(url);

    alert('Detailed report downloaded! Check your downloads folder.');
}

function findSuspicious() {
    const analyzer = window.instagramAnalyzer;
    const suspicious = analyzer.findSuspiciousAccounts();

    if (suspicious.length === 0) {
        alert('No suspicious accounts found!');
        return;
    }

    switchTab('insights');
    alert(`Found ${suspicious.length} potentially suspicious accounts. Check the Insights tab.`);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeFileHandling();

    ['relationshipFilter', 'timeFilter', 'sortFilter'].forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });

    document.getElementById('searchFilter').addEventListener('input',
        debounce(applyFilters, 300)
    );
});

// Export functions for global access
window.loadFollowingData = (jsonData) => window.instagramAnalyzer.loadFollowingData(jsonData);
window.loadFollowersData = (jsonData) => window.instagramAnalyzer.loadFollowersData(jsonData);
window.getAnalysisData = () => window.instagramAnalyzer.getFilteredData();
window.getStatistics = () => window.instagramAnalyzer.getStatistics();
window.updateFilters = (filters) => window.instagramAnalyzer.updateFilters(filters);
window.exportAnalysis = (filename) => window.instagramAnalyzer.exportToCSV(filename);
window.generateReport = () => window.instagramAnalyzer.generateReport();
window.createUserListHTML = createUserListHTML;

console.log('Instagram Analyzer loaded successfully!');