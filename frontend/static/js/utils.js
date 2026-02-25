// Math Helpers
const MathUtils = {
    earthRadius: 6371, // In km

    calculateDistance: function (lat1, lng1, lat2, lng2) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.earthRadius * c * 1000;
    },

    toRadians: function (degrees) {
        return degrees * (Math.PI / 180);
    },

    humanDistance: function (inp) {
        if (inp < 1000) return Math.round(inp) + 'm';
        return (inp / 1000).toFixed(1) + 'km';
    }
};
