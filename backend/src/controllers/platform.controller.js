const Organization = require('../models/Organization');
const User = require('../models/User');

/**
 * GET /platform/organizations
 * 
 * Aggregated, platform-level list of organizations.
 * Strictly gated to super_admin role.
 */
async function getPlatformOrganizations(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;

    // Fetch all organizations in the platform (paginated)
    const orgs = await Organization.find({})
      .skip(skip)
      .limit(limit);

    const total = await Organization.countDocuments({});
    const totalPages = Math.ceil(total / limit);

    // Map each organization to its high-level aggregates
    const data = [];
    for (const org of orgs) {
      const userCount = await User.countDocuments({ orgId: org._id });

      data.push({
        id: org._id.toString(),
        name: org.name,
        userCount,
        resourceCount: 0, // Will be resolved when resources model exists
        activeAlertCount: 0, // Will be resolved when alerts model exists
        isActive: org.isActive
      });
    }

    return res.status(200).json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages
      }
    });

  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPlatformOrganizations
};
