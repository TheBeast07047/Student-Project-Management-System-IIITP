/**
 * allocationUtils.js — Shared utility for allocation response handling
 *
 * Used by:
 *   - Sem5AllocatedFaculty.jsx
 *   - AllocationRunner.jsx (Sem 7, 8, and future semesters)
 *
 * Centralizes the response parsing, toast notifications, and result formatting
 * so allocation UX is consistent across all semesters.
 */

import { toast } from 'react-hot-toast';

/**
 * Parse the allocation API response into a flat, consistent shape.
 *
 * The API (`adminAPI.runAllocation`) uses fetch (not Axios), so it returns
 * the backend body directly:
 *   { success, message, data: { allocated, randomAllocated, skipped, errors, totalProcessed } }
 *
 * This function flattens it into:
 *   { message, allocated, randomAllocated, skipped, errors, totalProcessed }
 *
 * @param {Object} apiResponse - Raw response from adminAPI.runAllocation()
 * @returns {Object} Flattened allocation results
 */
export function parseAllocationResponse(apiResponse) {
    return {
        message: apiResponse.message || '',
        allocated: apiResponse.data?.allocated || [],
        randomAllocated: apiResponse.data?.randomAllocated || [],
        skipped: apiResponse.data?.skipped || [],
        errors: apiResponse.data?.errors || [],
        totalProcessed: apiResponse.data?.totalProcessed ?? 0,
    };
}

/**
 * Show the appropriate toast notification based on allocation results.
 *
 * - If totalProcessed === 0: shows an amber warning with the backend's reason
 *   (e.g., "7 groups pending but deadline hasn't passed yet")
 * - If totalProcessed > 0: shows a green success toast with the count
 *
 * @param {Object} results - Parsed allocation results from parseAllocationResponse()
 */
export function showAllocationToast(results) {
    if (results.totalProcessed === 0) {
        toast(results.message || 'No groups were processed.', {
            icon: '⚠️',
            duration: 6000,
            style: {
                background: '#FEF3C7',
                color: '#92400E',
                maxWidth: '500px',
            },
        });
    } else {
        const totalAllocated = results.allocated.length + results.randomAllocated.length;
        toast.success(`${totalAllocated} group(s) allocated successfully`);
    }
}
