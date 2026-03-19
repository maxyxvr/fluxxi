const Order = require('../models/Order');
const Driver = require('../models/Driver');

function assignDriver(orderId) {
  const driver = Driver.getBestForAssignment();
  if (!driver) return null;

  Order.assignDriver(orderId, driver.id);
  Driver.incrementActiveOrders(driver.id);

  return driver;
}

function releaseDriver(orderId) {
  const order = Order.getById(orderId);
  if (order && order.driver_id) {
    Driver.decrementActiveOrders(order.driver_id);
  }
}

module.exports = { assignDriver, releaseDriver };
