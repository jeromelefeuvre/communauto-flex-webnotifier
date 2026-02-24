const branchIds = {
    montreal: 1,
    quebec: 2,
    toronto: 3,
};

function getBookingUrl(city) {
    return `https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`;
}
