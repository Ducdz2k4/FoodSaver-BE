import { ApiError } from '../../shared/utils/apiError.js';

export const ALLOWED_TRANSITIONS = {
  PENDING: ['AWAITING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING', 'READY', 'HANDED_OVER', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['ACCEPTED', 'PREPARING', 'READY', 'HANDED_OVER', 'CANCELLED', 'EXPIRED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'READY', 'HANDED_OVER', 'CANCELLED', 'EXPIRED'],
  PREPARING: ['READY', 'HANDED_OVER', 'CANCELLED'],
  READY: ['HANDED_OVER', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  HANDED_OVER: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED']
};

export const OrderStateMachine = {
  canTransition(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return true;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
  },

  validateTransition(currentStatus, nextStatus) {
    if (!this.canTransition(currentStatus, nextStatus)) {
      throw ApiError.badRequest(
        `Không thể chuyển trạng thái đơn hàng từ "${currentStatus}" sang "${nextStatus}"!`
      );
    }
  }
};
