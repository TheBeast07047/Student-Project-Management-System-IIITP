const mongoose = require('mongoose');

const allocationRunSchema = new mongoose.Schema({
    // Semester & Academic Year
    semester: {
        type: Number,
        required: true,
        min: 1,
        max: 8,
        index: true
    },
    academicYear: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    // Run Status
    status: {
        type: String,
        enum: ['not_run', 'running', 'preview', 'confirmed', 'failed'],
        default: 'not_run',
        index: true
    },

    // Timestamps
    runAt: Date,
    confirmedAt: Date,
    confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // Config snapshot at run time
    config: {
        defaultFacultyCapacity: { type: Number, default: 4 },
        minGroupPreferences: { type: Number, default: 3 },
        maxGroupPreferences: { type: Number, default: 7 },
        tiebreakMethod: {
            type: String,
            enum: ['timestamp', 'random', 'alphabetical'],
            default: 'timestamp'
        },
        autoRankUnsubmittedFaculty: { type: Boolean, default: true }
    },

    // Algorithm Results Summary
    totalGroups: { type: Number, default: 0 },
    matchedGroups: { type: Number, default: 0 },
    adminPoolGroups: { type: Number, default: 0 },
    totalRounds: { type: Number, default: 0 },
    totalCapacity: { type: Number, default: 0 },

    // Detailed Results
    results: [{
        group: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Group',
            required: true
        },
        faculty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Faculty',
            required: true
        },
        matchedRound: { type: Number, required: true },
        preferenceRank: { type: Number }, // which preference # was matched (1 = top choice)
        allocatedBy: {
            type: String,
            enum: ['algorithm', 'admin'],
            default: 'algorithm'
        }
    }],

    // Admin Pool (unmatched groups)
    adminPool: [{
        group: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Group',
            required: true
        },
        reason: {
            type: String,
            enum: ['preferences_exhausted', 'capacity_exceeded', 'excluded'],
            default: 'preferences_exhausted'
        },
        // Admin manual assignment (filled in post-algorithm)
        assignedFaculty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Faculty'
        },
        assignedAt: Date,
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],

    // Pre-run validation report
    validationReport: {
        totalGroups: Number,
        validGroups: Number,
        excludedGroups: [{
            group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
            reason: String
        }],
        totalFaculty: Number,
        facultyWithRankings: Number,
        facultyWithoutRankings: Number,
        totalCapacity: Number,
        capacityWarning: String
    },

    // Error info (if failed)
    errorMessage: String,

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
allocationRunSchema.index({ semester: 1, academicYear: 1 });

// Pre-save middleware
allocationRunSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Static: Get the latest run for a semester
allocationRunSchema.statics.getLatestRun = function (semester, academicYear) {
    return this.findOne({ semester, academicYear })
        .sort({ createdAt: -1 })
        .populate('results.group', 'name members semester')
        .populate('results.faculty', 'fullName facultyId department')
        .populate('adminPool.group', 'name members semester')
        .populate('adminPool.assignedFaculty', 'fullName facultyId department')
        .populate('confirmedBy', 'email');
};

// Static: Get active (non-confirmed) run
allocationRunSchema.statics.getActiveRun = function (semester, academicYear) {
    return this.findOne({
        semester,
        academicYear,
        status: { $in: ['not_run', 'running', 'preview'] }
    }).sort({ createdAt: -1 });
};

// Method: Can re-run?
allocationRunSchema.methods.canRerun = function () {
    return this.status === 'preview' || this.status === 'not_run' || this.status === 'failed';
};

// Method: Can confirm?
allocationRunSchema.methods.canConfirm = function () {
    return this.status === 'preview';
};

module.exports = mongoose.model('AllocationRun', allocationRunSchema);
