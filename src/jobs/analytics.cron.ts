/**
 * ============================================
 * ANALYTICS CRON JOBS
 * ============================================
 *
 * Scheduled jobs for the Scentxury admin BI pipeline.
 * All jobs run in Africa/Lagos timezone (WAT, UTC+1).
 *
 * Jobs:
 *   dailySummaryCron      — 23:59 daily
 *   recurringExpensesCron — 01:00 on 1st of each month
 *   churnDetectionCron    — 03:00 every Monday
 *
 * Call startAnalyticsCrons() from src/server.ts after DB connection.
 *
 * @file src/jobs/analytics.cron.ts
 */

import { CronJob } from 'cron';
import { AnalyticsService } from '@services/analytics.service.js';
import { RecommendationService } from '@services/recommendation.service.js';
import { Expense } from '@models/Expense.js';
import { dashboardEvents } from '@services/socket.service.js';

const TIMEZONE = 'Africa/Lagos';

// ============================================
// DAILY SUMMARY CRON  — 23:59 every day
// ============================================

/**
 * Calculates the day's summary just before midnight.
 * Emits the updated summary to connected admin dashboards.
 */
export const dailySummaryCron = new CronJob(
  '59 23 * * *',
  async () => {
    try {
      console.log('[Cron] dailySummaryCron: starting daily summary calculation...');
      const summary = await AnalyticsService.calculateDailySummary(new Date());
      console.log('[Cron] dailySummaryCron: ✅ summary generated', {
        date: new Date().toISOString().split('T')[0],
        orders: summary.totalOrders,
        revenue: summary.netRevenue,
      });

      // Emit to connected admin clients
      dashboardEvents.dailySummaryUpdated({
        totalOrders: summary.totalOrders,
        netRevenue: summary.netRevenue,
        grossProfit: summary.grossProfit,
        unitsSold: summary.unitsBySize?.total ?? 0,
      });
    } catch (err) {
      console.error('[Cron] dailySummaryCron: ❌ error', err);
    }
  },
  null,         // onComplete
  false,        // start immediately — controlled by startAnalyticsCrons()
  TIMEZONE
);

// ============================================
// RECURRING EXPENSES CRON  — 01:00 on 1st of month
// ============================================

/**
 * Auto-creates a new Expense document for every recurring monthly expense.
 */
export const recurringExpensesCron = new CronJob(
  '0 1 1 * *',
  async () => {
    try {
      console.log('[Cron] recurringExpensesCron: processing recurring expenses...');

      const recurring = await Expense.find({
        isRecurring: true,
        recurringPeriod: 'monthly',
      }).lean();

      const today = new Date();
      const created = await Promise.all(
        recurring.map((e) =>
          Expense.create({
            category: e.category,
            description: e.description,
            amount: e.amount,
            currency: e.currency,
            isRecurring: false,  // New entry is non-recurring (snapshot)
            expenseDate: today,
            vendor: e.vendor,
            createdBy: e.createdBy,
          })
        )
      );

      console.log(`[Cron] recurringExpensesCron: ✅ auto-created ${created.length} expense(s)`);
    } catch (err) {
      console.error('[Cron] recurringExpensesCron: ❌ error', err);
    }
  },
  null,
  false,
  TIMEZONE
);

// ============================================
// CHURN DETECTION CRON  — 03:00 every Monday
// ============================================

/**
 * Clusters users by purchase behaviour and logs segment counts.
 */
export const churnDetectionCron = new CronJob(
  '0 3 * * 1',
  async () => {
    try {
      console.log('[Cron] churnDetectionCron: running user segmentation...');
      const segments = await RecommendationService.clusterUsersByBehaviour();
      console.log('[Cron] churnDetectionCron: ✅ segments', segments);
      // Future: call NotificationService.sendChurnRecoveryEmails() for at_risk users
    } catch (err) {
      console.error('[Cron] churnDetectionCron: ❌ error', err);
    }
  },
  null,
  false,
  TIMEZONE
);

// ============================================
// STARTER — called from server.ts
// ============================================

/**
 * Start all three analytics cron jobs.
 * Should be called after the database connection is established.
 */
export function startAnalyticsCrons(): void {
  dailySummaryCron.start();
  recurringExpensesCron.start();
  churnDetectionCron.start();

  console.log('⏰ Analytics cron jobs started:');
  console.log('   • dailySummaryCron      — 23:59 daily (Africa/Lagos)');
  console.log('   • recurringExpensesCron — 01:00 on 1st of month (Africa/Lagos)');
  console.log('   • churnDetectionCron    — 03:00 every Monday (Africa/Lagos)');
}
