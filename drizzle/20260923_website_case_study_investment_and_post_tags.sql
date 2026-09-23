-- Investment amount on case studies, and topic tags on blog posts, for the
-- filters on the public Case Studies and Resources pages. The old site had
-- both; the import on 23 Sep did not carry them because SavvyOS had nowhere
-- to put them.
--
-- MUST BE APPLIED BEFORE THE CODE MERGES. Railway does not run these files.
-- The Website Studio reads whole rows, so code that names these columns
-- fails against a table that does not have them yet.

ALTER TABLE `website_case_studies`
  ADD COLUMN `investmentAmount` decimal(14,2) NULL AFTER `secondaryMetricValue`;

ALTER TABLE `website_blog_posts`
  ADD COLUMN `tags` json NULL AFTER `category`;

-- One-time fill from the old site (savvy-agents.com/api/case-studies and
-- /api/blogs, read 23 Sep 2026), matched on slug. Safe to run twice. Rows
-- that were not imported simply match nothing. Two old case studies had no
-- amount and are left NULL.

UPDATE `website_case_studies` SET `investmentAmount` = 1140000 WHERE `slug` = 'orem-utah-511755547';
UPDATE `website_case_studies` SET `investmentAmount` = 355000 WHERE `slug` = '1237-s-virginia-dare-trl-kill-devil-hills-nc-163128803';
UPDATE `website_case_studies` SET `investmentAmount` = 705000 WHERE `slug` = '5747-n-16th-st-phoenix-az-458736053';
UPDATE `website_case_studies` SET `investmentAmount` = 900000 WHERE `slug` = 'sunshine-retreat-fort-lauderdale-fl-516929127';
UPDATE `website_case_studies` SET `investmentAmount` = 389000 WHERE `slug` = '307-w-avalon-dr-kill-devil-hills-nc-512054311';
UPDATE `website_case_studies` SET `investmentAmount` = 1939000 WHERE `slug` = '1205-s-virginia-dare-trail-811160593';
UPDATE `website_case_studies` SET `investmentAmount` = 266500 WHERE `slug` = 'brandyapple-retreat-family-friendly-oasis-323607880';
UPDATE `website_case_studies` SET `investmentAmount` = 755000 WHERE `slug` = '6724-beach-dr-panama-city-beach-363055429';
UPDATE `website_case_studies` SET `investmentAmount` = 480000 WHERE `slug` = '7170-lawrenceburg-rd-chaplin-ky-512948869';
UPDATE `website_case_studies` SET `investmentAmount` = 730000 WHERE `slug` = '235-westover-rd-frankfort-ky-792369296';
UPDATE `website_case_studies` SET `investmentAmount` = 721000 WHERE `slug` = '339-ocean-course-ave-champions-gate-fl-812957268';
UPDATE `website_case_studies` SET `investmentAmount` = 675000 WHERE `slug` = '12-collison-ct-palm-coast-fl-805220550';
UPDATE `website_case_studies` SET `investmentAmount` = 1550000 WHERE `slug` = '3-1st-street-st-augustine-fl-350405983';
UPDATE `website_case_studies` SET `investmentAmount` = 705000 WHERE `slug` = '172-3rd-ave-west-glacier-mt-163050251';
UPDATE `website_case_studies` SET `investmentAmount` = 405000 WHERE `slug` = '445-poplar-drive-greenwood-in-772655406';
UPDATE `website_case_studies` SET `investmentAmount` = 550000 WHERE `slug` = '124-rose-coral-dr-panama-city-beach-fl-800358881';
UPDATE `website_case_studies` SET `investmentAmount` = 455000 WHERE `slug` = '634-cypresswood-dr-spring-tx-862669538';
UPDATE `website_case_studies` SET `investmentAmount` = 1300000 WHERE `slug` = '3071-hafen-ln-melbourne-beach-fl-046957209';
UPDATE `website_case_studies` SET `investmentAmount` = 655000 WHERE `slug` = 'sandy-utah-creative-finance-deal-440997657';
UPDATE `website_case_studies` SET `investmentAmount` = 100118 WHERE `slug` = 'wentzvilles-grandmas-revival-138948136';
UPDATE `website_case_studies` SET `investmentAmount` = 300000 WHERE `slug` = 'a-shore-thing-belmar-nj-a-2-bedroom-that-out-earns-the-market-837027882';
UPDATE `website_case_studies` SET `investmentAmount` = 2000000 WHERE `slug` = 'epic-rooftop-st-augustine-beach-case-study-top-performing-property-now-value-add-996576867';
UPDATE `website_case_studies` SET `investmentAmount` = 845000 WHERE `slug` = '621-decatur-drive-wilmington-nc-28403-735767938';
UPDATE `website_case_studies` SET `investmentAmount` = 600000 WHERE `slug` = '4449-forest-vista-way-pigeon-forge-tn-982027370';
UPDATE `website_case_studies` SET `investmentAmount` = 974701 WHERE `slug` = 'draper-utah-948735786';
UPDATE `website_case_studies` SET `investmentAmount` = 420000 WHERE `slug` = 'great-hendersonville-nc-bungalow-5-min-from-downtown-883774461';
UPDATE `website_case_studies` SET `investmentAmount` = 580000 WHERE `slug` = '5-br-pool-purchase-in-greenville-in-july-2025-073852049';
UPDATE `website_case_studies` SET `investmentAmount` = 775000 WHERE `slug` = 'east-of-zion-514780375';
UPDATE `website_case_studies` SET `investmentAmount` = 1939000 WHERE `slug` = 'the-grand-dune-006579390';
UPDATE `website_case_studies` SET `investmentAmount` = 525000 WHERE `slug` = '1237-s-virginia-dare-trail-kill-devil-hills-nc-27948-865648816';
UPDATE `website_case_studies` SET `investmentAmount` = 389000 WHERE `slug` = '307-w-avalon-drive-kill-devil-hills-nc-27948-138334988';
UPDATE `website_case_studies` SET `investmentAmount` = 764000 WHERE `slug` = '84-climbing-aster-way-asheville-nc-152837900';
UPDATE `website_case_studies` SET `investmentAmount` = 775000 WHERE `slug` = '47-lawson-ridge-rd-leicester-nc-449969606';
UPDATE `website_case_studies` SET `investmentAmount` = 749000 WHERE `slug` = '32-bill-horne-dr-swannanoa-nc-132235582';
UPDATE `website_case_studies` SET `investmentAmount` = 655000 WHERE `slug` = '105-lamplighter-ridge-trl-candler-nc-937902916';
UPDATE `website_case_studies` SET `investmentAmount` = 920000 WHERE `slug` = '1-covewood-ct-arden-nc-668348042';
UPDATE `website_case_studies` SET `investmentAmount` = 751000 WHERE `slug` = '25-old-heywood-rd-arden-nc-428611981';
UPDATE `website_case_studies` SET `investmentAmount` = 851000 WHERE `slug` = '15-gaston-mountain-rd-asheville-nc-188239229';
UPDATE `website_case_studies` SET `investmentAmount` = 1265000 WHERE `slug` = '185-joe-bailey-rd-fletcher-nc-935519173';
UPDATE `website_case_studies` SET `investmentAmount` = 780000 WHERE `slug` = '36-long-meadows-drive-leicester-nc-745785713';
UPDATE `website_case_studies` SET `investmentAmount` = 825000 WHERE `slug` = '11-landon-rd-fairview-nc-451406463';
UPDATE `website_case_studies` SET `investmentAmount` = 825000 WHERE `slug` = '258-bodges-ln-hendersonville-nc-221701633';
UPDATE `website_case_studies` SET `investmentAmount` = 727500 WHERE `slug` = '76-climbing-aster-way-asheville-nc-739372580';
UPDATE `website_case_studies` SET `investmentAmount` = 668000 WHERE `slug` = '322-goughes-branch-rd-leicester-nc-709358531';
UPDATE `website_case_studies` SET `investmentAmount` = 820000 WHERE `slug` = '50-ponderosa-trl-rosman-nc-398763144';
UPDATE `website_case_studies` SET `investmentAmount` = 1100000 WHERE `slug` = '29-hope-view-rd-swannanoa-nc-608263135';
UPDATE `website_case_studies` SET `investmentAmount` = 612500 WHERE `slug` = '928-deer-ridge-trl-marion-383175292';
UPDATE `website_case_studies` SET `investmentAmount` = 636000 WHERE `slug` = '116-hummingbird-lane-waynesville-nc-920801564';
UPDATE `website_case_studies` SET `investmentAmount` = 485000 WHERE `slug` = '1085-sheepback-mountain-rd-maggie-valley-nc-158714710';
UPDATE `website_case_studies` SET `investmentAmount` = 1150000 WHERE `slug` = '383-hews-circle-blowing-rock-nc-897420937';
UPDATE `website_case_studies` SET `investmentAmount` = 960000 WHERE `slug` = '207-pine-hill-dr-swannanoa-nc-503924846';
UPDATE `website_case_studies` SET `investmentAmount` = 600000 WHERE `slug` = '402-day-lily-dr-leicester-nc-236191224';
UPDATE `website_case_studies` SET `investmentAmount` = 515000 WHERE `slug` = '51-hy-vu-dr-waynesville-nc-330649887';
UPDATE `website_case_studies` SET `investmentAmount` = 625000 WHERE `slug` = '133-last-resort-black-mountain-nc-264921046';
UPDATE `website_case_studies` SET `investmentAmount` = 707000 WHERE `slug` = '840-jenkins-valley-rd-alexander-nc-671558559';
UPDATE `website_case_studies` SET `investmentAmount` = 515000 WHERE `slug` = '225-long-range-lane-leicester-nc-259077044';
UPDATE `website_case_studies` SET `investmentAmount` = 850000 WHERE `slug` = '44-penley-rd-fletcher-nc-073987548';
UPDATE `website_case_studies` SET `investmentAmount` = 979000 WHERE `slug` = '347-vixen-lane-blowing-rock-nc-630819889';
UPDATE `website_case_studies` SET `investmentAmount` = 465000 WHERE `slug` = '6442-hickory-nut-gap-rd-banner-elk-nc-660238550';
UPDATE `website_case_studies` SET `investmentAmount` = 1000000 WHERE `slug` = '575-grandfather-farms-rd-banner-elk-nc-778127718';
UPDATE `website_case_studies` SET `investmentAmount` = 1000000 WHERE `slug` = '42-little-oak-rd-leicester-nc-28748-267317738';
UPDATE `website_case_studies` SET `investmentAmount` = 775000 WHERE `slug` = '10-shackleford-dr-asheville-nc-441455935';
UPDATE `website_case_studies` SET `investmentAmount` = 825000 WHERE `slug` = '20-uncle-dr-asheville-nc-910594580';

UPDATE `website_blog_posts` SET `tags` = CAST('["Investment Tips", "market spotlight", "Oak Island", "design"]' AS JSON) WHERE LOWER(`slug`) = LOWER('brunswick-county-beach-str-design-opportunity');
UPDATE `website_blog_posts` SET `tags` = CAST('["jersey shore", "buyer goals", "str investing", "discovery questions"]' AS JSON) WHERE LOWER(`slug`) = LOWER('what-are-you-actually-buying-this-NJ-shore-STR-for');
UPDATE `website_blog_posts` SET `tags` = CAST('["cape cod", "str regulation", "buying"]' AS JSON) WHERE LOWER(`slug`) = LOWER('cape-cod-str-rules-before-you-buy');
UPDATE `website_blog_posts` SET `tags` = CAST('["jersey shore", "bonus depreciation", "cost segregation", "placed in service", "str taxes", "fall buying window"]' AS JSON) WHERE LOWER(`slug`) = LOWER('jersey-shore-december-31-in-service-timeline');
UPDATE `website_blog_posts` SET `tags` = CAST('["Investment", "STR", "Data", "Year 1 vs Year 2"]' AS JSON) WHERE LOWER(`slug`) = LOWER('year-one-vs-year-two-what-2-years-of-real-str-performance-data-shows');
UPDATE `website_blog_posts` SET `tags` = CAST('["STR Investing", "Q3", "Tax Savings", "STR", "Investing", "Passive Income", "real estate investing", "bonus depreciation"]' AS JSON) WHERE LOWER(`slug`) = LOWER('the-q3-clock-is-getting-real-for-tax-motivated-str-buyers');
UPDATE `website_blog_posts` SET `tags` = CAST('["jersey shore", "self management", "str operations", "cohosting"]' AS JSON) WHERE LOWER(`slug`) = LOWER('can-you-self-manage-a-jersey-shore-rental-with-a-full-time-job');
UPDATE `website_blog_posts` SET `tags` = CAST('["AIRDNA", "Hisotorical data", "history", "data", "data tool", "STR", "investment"]' AS JSON) WHERE LOWER(`slug`) = LOWER('historical-str-data-is-lying-to-you-and-it-s-time-someone-said-it');
UPDATE `website_blog_posts` SET `tags` = CAST('["STR Investing", "Short-Term Rentals", "Vacation Rental Investing", "STR Revenue", "Rental Revenue", "ADR", "Average Daily Rate", "Vacation Rental Management", "STR Investors", "STR Sellers", "Rental Property Analysis", "STR Property Management", "Revenue Optimization", "Vacation Rental Owners", "Real Estate Investing", "Savvy STR Agents"]' AS JSON) WHERE LOWER(`slug`) = LOWER('when-the-str-numbers-don-t-add-up-a-savvy-investor-looks-deeper');
UPDATE `website_blog_posts` SET `tags` = CAST('["Outer Banks Real Estate", "Outer Banks STR", "Short-Term Rental Investing", "STR Investment", "Cost Segregation", "Bonus Depreciation", "STR Tax Benefits", "Real Estate Investing", "Vacation Rental Investment", "Coastal Real Estate", "OBX Investment Property", "Land Value", "Real Estate Appreciation", "STR Investors", "Investment Strategy", "Passive Income", "Vacation Rental Property"]' AS JSON) WHERE LOWER(`slug`) = LOWER('high-land-values-cost-segregation-why-savvy-str-investors-shouldn-t-overlook-the-outer-banks');
UPDATE `website_blog_posts` SET `tags` = CAST('["jersey shore", "regulations", "occupancy tax", "inspections", "bradley beach", "belmar"]' AS JSON) WHERE LOWER(`slug`) = LOWER('jersey-shore-str-rules-town-by-town');
UPDATE `website_blog_posts` SET `tags` = CAST('["Investment tips", "STR", "Cash-Flow", "Smokies Cabins"]' AS JSON) WHERE LOWER(`slug`) = LOWER('why-so-many-smokies-cabins-don-t-cash-flow-and-what-the-good-deals-have-in-common');
UPDATE `website_blog_posts` SET `tags` = CAST('["Outer Banks Real Estate", "OBX Real Estate", "Outer Banks Investment Property", "OBX Investment Property", "STR Investing", "Short-Term Rentals", "Vacation Rental Investment", "Real Estate Investing", "Investment Strategy", "Savvy Investors", "Buyer Opportunities", "Seller Opportunities", "Buy and Sell", "Market Timing", "Year-End Investing", "Vacation Rental Market", "Outer Banks STR", "OBX Investors", "Win-Win Real Estate", "Savvy STR Agents", "passive income"]' AS JSON) WHERE LOWER(`slug`) = LOWER('wait-how-can-it-be-a-great-time-to-both-buy-and-sell-in-the-outer-banks');
UPDATE `website_blog_posts` SET `tags` = CAST('["jersey shore", "str returns", "investment math", "belmar", "appreciation", "str tax"]' AS JSON) WHERE LOWER(`slug`) = LOWER('what-a-jersey-shore-return-actually-looks-like');
UPDATE `website_blog_posts` SET `tags` = CAST('["Gulf Shores condo", "condo vs single family home", "Gulf Shores real estate", "Orange Beach condo investment", "condo HOA fees", "short term rental condo", "STR investment Alabama", "condo assessments", "Gulf Shores vacation rental", "HOA due diligence", "condo insurance costs", "Alabama Gulf Coast real estate"]' AS JSON) WHERE LOWER(`slug`) = LOWER('the-ugly-truth-about-condos-in-gulf-shores');
UPDATE `website_blog_posts` SET `tags` = CAST('["jersey shore", "str market data", "belmar", "ocean grove", "lbi", "cape may county"]' AS JSON) WHERE LOWER(`slug`) = LOWER('why-the-jersey-shore-is-the-northeasts-most-overlooked-str-market');
UPDATE `website_blog_posts` SET `tags` = CAST('["Outer Banks Real Estate", "Outer Banks Investment Property", "Outer Banks STR", "Short-Term Rental Investing", "STR Investment", "Vacation Rental Property", "Selling an STR", "Selling Investment Property", "Outer Banks Property Owners", "Outer Banks Investors", "1031 Exchange", "Real Estate Investing", "Vacation Rental Investing", "Outer Banks Market", "OBX Real Estate", "OBX Investment Property", "OBX Vacation Rentals", "Investment Property Strategy", "STR Owners", "Savvy STR Agents", "passive income"]' AS JSON) WHERE LOWER(`slug`) = LOWER('why-savvy-outer-banks-owners-know-this-is-the-right-time-to-sell');
UPDATE `website_blog_posts` SET `tags` = CAST('["Success", "Amenities", "Airbnb", "Investing"]' AS JSON) WHERE LOWER(`slug`) = LOWER('views-amenities-execution-my-broken-record');
UPDATE `website_blog_posts` SET `tags` = CAST('["Mountain", "Ski", "Utah", "National Parks"]' AS JSON) WHERE LOWER(`slug`) = LOWER('why-utah-is-built-for-short-term-rental-investors');
UPDATE `website_blog_posts` SET `tags` = CAST('["investment", "beach", "bedroom size", "gulf coast", "Alabama"]' AS JSON) WHERE LOWER(`slug`) = LOWER('orange-beach-is-strong-but-don-t-buy-a-3-bedroom');
UPDATE `website_blog_posts` SET `tags` = CAST('["Outer Banks Real Estate", "Outer Banks Investment Property", "Outer Banks Short-Term Rentals", "OBX Investment Properties", "Vacation Rental Investment", "Short-Term Rental Investing", "STR Investing", "Real Estate Investing", "Investment Property", "Rental Property", "Vacation Home Investment", "Savvy Investors", "Passive Income", "Wealth Building", "Investment Strategy", "Year-End Tax Planning", "Real Estate Tax Benefits", "Cost Segregation", "Depreciation Strategies", "1031 Exchange", "Off-Season Buying", "Buy Before Spring", "Outer Banks Vacation Rentals", "Coastal Real Estate", "Income-Producing Property", "Rental Property ROI", "Property Management", "Investment Opportunities", "Financial Freedom", "Outer Banks Lifestyle"]' AS JSON) WHERE LOWER(`slug`) = LOWER('why-savvy-outer-banks-investors-know-this-is-the-right-time-to-buy');
UPDATE `website_blog_posts` SET `tags` = CAST('["investment", "STR", "Beach Rentals", "Gulf Coast"]' AS JSON) WHERE LOWER(`slug`) = LOWER('new-runway-new-renters-what-gulf-shores-airport-boom-means-for-your-rental');
UPDATE `website_blog_posts` SET `tags` = CAST('["investment property", "STR loophole", "bonus depreciation"]' AS JSON) WHERE LOWER(`slug`) = LOWER('st-louis-short-term-rental-bonus-depreciation');
UPDATE `website_blog_posts` SET `tags` = CAST('["smoky mountains str", "outer banks str", "beach vs mountain", "market comparison", "savvy str agents"]' AS JSON) WHERE LOWER(`slug`) = LOWER('smoky-mountains-vs-outer-banks-str-investment');
UPDATE `website_blog_posts` SET `tags` = CAST('["str insurance", "guest liability", "vacation rental risk", "portfolio protection", "savvy str agents"]' AS JSON) WHERE LOWER(`slug`) = LOWER('short-term-rental-insurance-guide');
UPDATE `website_blog_posts` SET `tags` = CAST('["str financing", "dscr loans", "airbnb mortgage", "portfolio scaling", "savvy str agents"]' AS JSON) WHERE LOWER(`slug`) = LOWER('dscr-loans-short-term-rentals-guide');
UPDATE `website_blog_posts` SET `tags` = CAST('["str underwriting", "airbnb investment", "vacation rental roi", "deal analysis", "savvy str agents"]' AS JSON) WHERE LOWER(`slug`) = LOWER('how-to-analyze-short-term-rental-investment');
UPDATE `website_blog_posts` SET `tags` = CAST('["best str markets", "airbnb investing", "cash flow markets", "str market score", "savvy str agents"]' AS JSON) WHERE LOWER(`slug`) = LOWER('best-short-term-rental-markets-2026');
