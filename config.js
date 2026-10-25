// Chỉ điền Project URL và Publishable key (hoặc anon public key).
// Tuyệt đối không đưa service_role / secret key vào file này.
window.CHUOI_CONFIG = { url: 'https://rigrqwzvwqxlbnhqylxr.supabase.co', key: 'sb_publishable_-Hk68JZ-hnN6lVawuiOo3A_bVQ1KcnW', vapidPublicKey: 'BMO6oBRVp0Oq5JZ4NBmLdcdlVYNtkPplcTozV283uG5ycsWzLSJEJ9NPn-hAW-GNV7t2WRXZeFBf5r-DbwmGnVo' };
// Cuộc gọi thoại/video: STUN Google + TURN trung chuyển công khai (Open Relay của Metered — dùng chung, miễn phí).
// TURN là đường vòng bắt buộc khi hai máy ở hai mạng "khó" (4G nhà mạng, Wi-Fi chặn) không nối thẳng được
// với nhau — thiếu nó sẽ có cặp người dùng mãi đen màn hình dù tín hiệu vẫn đúng.
// Dùng lâu dài nên thay bằng TURN riêng miễn phí của bạn (cách lấy trong NANG-CAP-CALL-NHOM-4.11.md).
window.CHUOI_CONFIG.iceServers = [
 { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
 { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
 { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
 { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];
