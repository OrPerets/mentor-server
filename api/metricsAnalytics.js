// Comprehensive exam metrics analytics and research helpers

/**
 * Analyzes typing patterns for behavioral insights
 */
function analyzeTypingBehavior(examAnswers) {
  const results = {
    overallStats: {},
    studentProfiles: {},
    anomalies: [],
    researchInsights: {}
  };

  // Overall statistics
  const allMetrics = examAnswers
    .filter(answer => answer.behaviorAnalytics)
    .map(answer => answer.behaviorAnalytics);

  if (allMetrics.length === 0) {
    return results;
  }

  // Calculate aggregate statistics
  results.overallStats = {
    averageWPM: calculateMean(allMetrics.map(m => m.wordsPerMinute)),
    medianWPM: calculateMedian(allMetrics.map(m => m.wordsPerMinute)),
    averageRhythmConsistency: calculateMean(allMetrics.map(m => m.rhythmConsistency)),
    averageConfidenceScore: calculateMean(allMetrics.map(m => m.confidenceScore)),
    averageFocusScore: calculateMean(allMetrics.map(m => m.focusScore)),
    totalTabSwitches: allMetrics.reduce((sum, m) => sum + m.tabSwitches, 0),
    suspiciousActivities: allMetrics.filter(m => 
      m.suspiciousTypingSpeed || m.pasteFromExternal || m.devToolsOpened
    ).length
  };

  // Group by student for individual profiles
  const studentGroups = groupBy(examAnswers, 'examId');
  
  Object.keys(studentGroups).forEach(examId => {
    const studentAnswers = studentGroups[examId];
    const studentMetrics = studentAnswers
      .filter(answer => answer.behaviorAnalytics)
      .map(answer => answer.behaviorAnalytics);

    if (studentMetrics.length > 0) {
      results.studentProfiles[examId] = analyzeStudentProfile(studentMetrics, studentAnswers);
    }
  });

  // Detect anomalies
  results.anomalies = detectAnomalies(allMetrics, examAnswers);

  // Research insights
  results.researchInsights = generateResearchInsights(allMetrics, examAnswers);

  return results;
}

/**
 * Analyzes individual student profile based on their metrics
 */
function analyzeStudentProfile(studentMetrics, studentAnswers) {
  const profile = {
    typingProfile: {},
    cognitiveProfile: {},
    integrityProfile: {},
    performanceCorrelation: {},
    difficultyProgression: {}
  };

  // Typing profile
  profile.typingProfile = {
    averageWPM: calculateMean(studentMetrics.map(m => m.wordsPerMinute)),
    wpmVariability: calculateStandardDeviation(studentMetrics.map(m => m.wordsPerMinute)),
    rhythmConsistency: calculateMean(studentMetrics.map(m => m.rhythmConsistency)),
    editingEfficiency: calculateMean(studentMetrics.map(m => m.editingEfficiency)),
    pausePatterns: {
      averagePauses: calculateMean(studentMetrics.map(m => m.pauseCount)),
      longPauses: calculateMean(studentMetrics.map(m => m.longPauseCount))
    }
  };

  // Cognitive profile
  profile.cognitiveProfile = {
    averageThinkTime: calculateMean(studentMetrics.map(m => m.timeToFirstKeystroke)),
    confidenceScore: calculateMean(studentMetrics.map(m => m.confidenceScore)),
    stressIndicators: calculateMean(studentMetrics.map(m => m.stressIndicators)),
    hesitationPattern: calculateMean(studentMetrics.map(m => m.hesitationIndicators))
  };

  // Academic integrity profile
  profile.integrityProfile = {
    focusScore: calculateMean(studentMetrics.map(m => m.focusScore)),
    tabSwitches: studentMetrics.reduce((sum, m) => sum + m.tabSwitches, 0),
    suspiciousActivities: studentMetrics.filter(m => 
      m.suspiciousTypingSpeed || m.pasteFromExternal || m.devToolsOpened
    ).length,
    interfaceUsage: {
      sidebarToggles: studentMetrics.reduce((sum, m) => sum + m.sidebarToggleCount, 0),
      modalOpens: studentMetrics.reduce((sum, m) => sum + m.modalOpenCount, 0)
    }
  };

  // Performance correlation
  const correctAnswers = studentAnswers.filter(a => a.isCorrect).length;
  profile.performanceCorrelation = {
    accuracy: correctAnswers / studentAnswers.length,
    timeVsAccuracy: analyzeTimeAccuracyCorrelation(studentAnswers),
    confidenceVsAccuracy: analyzeConfidenceAccuracyCorrelation(studentAnswers)
  };

  // Difficulty progression analysis
  profile.difficultyProgression = analyzeDifficultyProgression(studentAnswers);

  return profile;
}

/**
 * Detects anomalies in behavior patterns
 */
function detectAnomalies(allMetrics, examAnswers) {
  const anomalies = [];

  // WPM anomalies (too fast or too slow)
  const wpmMean = calculateMean(allMetrics.map(m => m.wordsPerMinute));
  const wpmStd = calculateStandardDeviation(allMetrics.map(m => m.wordsPerMinute));
  
  examAnswers.forEach(answer => {
    if (answer.behaviorAnalytics) {
      const wpm = answer.behaviorAnalytics.wordsPerMinute;
      
      // Detect extreme WPM values (more than 2 standard deviations)
      if (Math.abs(wpm - wpmMean) > 2 * wpmStd) {
        anomalies.push({
          type: 'extreme_wpm',
          examId: answer.examId,
          questionIndex: answer.questionIndex,
          value: wpm,
          severity: wpm > 150 ? 'high' : 'medium',
          description: wpm > 150 ? 'Unusually fast typing' : 'Unusually slow typing'
        });
      }

      // Detect copy-paste activities
      if (answer.behaviorAnalytics.pasteFromExternal) {
        anomalies.push({
          type: 'copy_paste',
          examId: answer.examId,
          questionIndex: answer.questionIndex,
          severity: 'high',
          description: 'Content pasted from external source'
        });
      }

      // Detect dev tools usage
      if (answer.behaviorAnalytics.devToolsOpened) {
        anomalies.push({
          type: 'dev_tools',
          examId: answer.examId,
          questionIndex: answer.questionIndex,
          severity: 'high',
          description: 'Developer tools detected'
        });
      }

      // Detect attention issues
      if (answer.behaviorAnalytics.focusScore < 0.5) {
        anomalies.push({
          type: 'attention_issue',
          examId: answer.examId,
          questionIndex: answer.questionIndex,
          value: answer.behaviorAnalytics.focusScore,
          severity: 'medium',
          description: 'Poor focus during question'
        });
      }

      // Detect excessive tab switching
      if (answer.behaviorAnalytics.tabSwitches > 5) {
        anomalies.push({
          type: 'excessive_tab_switching',
          examId: answer.examId,
          questionIndex: answer.questionIndex,
          value: answer.behaviorAnalytics.tabSwitches,
          severity: 'medium',
          description: 'Excessive tab switching behavior'
        });
      }
    }
  });

  return anomalies;
}

/**
 * Generates research insights from aggregated metrics
 */
function generateResearchInsights(allMetrics, examAnswers) {
  const insights = {
    correlations: {},
    patterns: {},
    recommendations: []
  };

  // Analyze correlations
  insights.correlations = {
    confidenceVsPerformance: analyzeCorrelation(
      examAnswers.map(a => a.behaviorAnalytics?.confidenceScore || 0),
      examAnswers.map(a => a.isCorrect ? 1 : 0)
    ),
    typingSpeedVsPerformance: analyzeCorrelation(
      examAnswers.map(a => a.behaviorAnalytics?.wordsPerMinute || 0),
      examAnswers.map(a => a.isCorrect ? 1 : 0)
    ),
    focusVsPerformance: analyzeCorrelation(
      examAnswers.map(a => a.behaviorAnalytics?.focusScore || 0),
      examAnswers.map(a => a.isCorrect ? 1 : 0)
    ),
    thinkTimeVsPerformance: analyzeCorrelation(
      examAnswers.map(a => a.behaviorAnalytics?.timeToFirstKeystroke || 0),
      examAnswers.map(a => a.isCorrect ? 1 : 0)
    )
  };

  // Identify patterns
  insights.patterns = {
    typingSpeedDistribution: analyzeDistribution(allMetrics.map(m => m.wordsPerMinute)),
    confidenceDistribution: analyzeDistribution(allMetrics.map(m => m.confidenceScore)),
    difficultyImpact: analyzeDifficultyImpact(examAnswers),
    timeOfDayEffects: analyzeTimeEffects(examAnswers)
  };

  // Generate recommendations
  insights.recommendations = generateRecommendations(insights, allMetrics, examAnswers);

  return insights;
}

/**
 * Analyzes correlation between time spent and accuracy
 */
function analyzeTimeAccuracyCorrelation(answers) {
  const timeSpent = answers.map(a => a.timeSpent);
  const accuracy = answers.map(a => a.isCorrect ? 1 : 0);
  return analyzeCorrelation(timeSpent, accuracy);
}

/**
 * Analyzes correlation between confidence and accuracy
 */
function analyzeConfidenceAccuracyCorrelation(answers) {
  const confidence = answers.map(a => a.behaviorAnalytics?.confidenceScore || 0);
  const accuracy = answers.map(a => a.isCorrect ? 1 : 0);
  return analyzeCorrelation(confidence, accuracy);
}

/**
 * Analyzes how performance changes with question difficulty
 */
function analyzeDifficultyProgression(answers) {
  const byDifficulty = groupBy(answers, 'difficulty');
  const progression = {};

  Object.keys(byDifficulty).forEach(difficulty => {
    const difficultyAnswers = byDifficulty[difficulty];
    const accuracy = difficultyAnswers.filter(a => a.isCorrect).length / difficultyAnswers.length;
    const avgTime = calculateMean(difficultyAnswers.map(a => a.timeSpent));
    const avgConfidence = calculateMean(
      difficultyAnswers.map(a => a.behaviorAnalytics?.confidenceScore || 0)
    );

    progression[difficulty] = {
      accuracy,
      averageTime: avgTime,
      averageConfidence: avgConfidence,
      questionCount: difficultyAnswers.length
    };
  });

  return progression;
}

/**
 * Analyzes how difficulty affects various behavioral metrics
 */
function analyzeDifficultyImpact(examAnswers) {
  const byDifficulty = groupBy(examAnswers, 'difficulty');
  const impact = {};

  Object.keys(byDifficulty).forEach(difficulty => {
    const answers = byDifficulty[difficulty];
    const metrics = answers
      .filter(a => a.behaviorAnalytics)
      .map(a => a.behaviorAnalytics);

    if (metrics.length > 0) {
      impact[difficulty] = {
        averageWPM: calculateMean(metrics.map(m => m.wordsPerMinute)),
        averageConfidence: calculateMean(metrics.map(m => m.confidenceScore)),
        averageThinkTime: calculateMean(metrics.map(m => m.timeToFirstKeystroke)),
        averagePauses: calculateMean(metrics.map(m => m.pauseCount)),
        accuracy: answers.filter(a => a.isCorrect).length / answers.length
      };
    }
  });

  return impact;
}

/**
 * Analyzes time-of-day effects on performance
 */
function analyzeTimeEffects(examAnswers) {
  const timeGroups = {};
  
  examAnswers.forEach(answer => {
    const hour = new Date(answer.submittedAt).getHours();
    const timeSlot = getTimeSlot(hour);
    
    if (!timeGroups[timeSlot]) {
      timeGroups[timeSlot] = [];
    }
    timeGroups[timeSlot].push(answer);
  });

  const effects = {};
  Object.keys(timeGroups).forEach(timeSlot => {
    const answers = timeGroups[timeSlot];
    const accuracy = answers.filter(a => a.isCorrect).length / answers.length;
    const avgTime = calculateMean(answers.map(a => a.timeSpent));
    
    effects[timeSlot] = {
      accuracy,
      averageTime: avgTime,
      studentCount: new Set(answers.map(a => a.examId)).size
    };
  });

  return effects;
}

/**
 * Generates actionable recommendations based on analysis
 */
function generateRecommendations(insights, metrics, answers) {
  const recommendations = [];

  // Performance recommendations
  if (insights.correlations.confidenceVsPerformance > 0.7) {
    recommendations.push({
      type: 'teaching',
      priority: 'high',
      message: 'Strong correlation between confidence and performance detected. Consider confidence-building exercises.'
    });
  }

  if (insights.correlations.focusVsPerformance > 0.6) {
    recommendations.push({
      type: 'exam_design',
      priority: 'medium',
      message: 'Focus significantly impacts performance. Consider minimizing distractions in exam environment.'
    });
  }

  // Integrity recommendations
  const suspiciousCount = metrics.filter(m => 
    m.suspiciousTypingSpeed || m.pasteFromExternal || m.devToolsOpened
  ).length;
  
  if (suspiciousCount > metrics.length * 0.1) {
    recommendations.push({
      type: 'security',
      priority: 'high',
      message: `${suspiciousCount} potentially suspicious activities detected. Review security measures.`
    });
  }

  // Learning recommendations
  const lowConfidenceCount = metrics.filter(m => m.confidenceScore < 0.5).length;
  if (lowConfidenceCount > metrics.length * 0.3) {
    recommendations.push({
      type: 'curriculum',
      priority: 'medium',
      message: 'Many students show low confidence. Consider additional practice sessions.'
    });
  }

  return recommendations;
}

// Utility functions
function calculateMean(arr) {
  return arr.length > 0 ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
}

function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calculateStandardDeviation(arr) {
  const mean = calculateMean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function analyzeCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const meanX = calculateMean(x);
  const meanY = calculateMean(y);
  
  const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
  const denominator = Math.sqrt(
    x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0) *
    y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0)
  );
  
  return denominator === 0 ? 0 : numerator / denominator;
}

function analyzeDistribution(arr) {
  if (arr.length === 0) return {};
  
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: calculateMean(arr),
    median: calculateMedian(arr),
    standardDeviation: calculateStandardDeviation(arr),
    percentiles: {
      p25: sorted[Math.floor(sorted.length * 0.25)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.90)]
    }
  };
}

function groupBy(arr, key) {
  return arr.reduce((groups, item) => {
    const groupKey = item[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {});
}

function getTimeSlot(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Main function to generate comprehensive analytics report
 */
function generateAnalyticsReport(examAnswers) {
  const report = {
    summary: {
      totalAnswers: examAnswers.length,
      totalStudents: new Set(examAnswers.map(a => a.examId)).size,
      analysisTimestamp: new Date(),
      metricsAvailable: examAnswers.filter(a => a.behaviorAnalytics).length
    },
    behaviorAnalysis: analyzeTypingBehavior(examAnswers),
    performanceAnalysis: analyzePerformance(examAnswers),
    integrityAnalysis: analyzeIntegrity(examAnswers),
    recommendations: []
  };

  // Combine recommendations from all analyses
  report.recommendations = [
    ...report.behaviorAnalysis.researchInsights.recommendations,
    ...generateGeneralRecommendations(report)
  ];

  return report;
}

function analyzePerformance(examAnswers) {
  const byDifficulty = groupBy(examAnswers, 'difficulty');
  const performance = {};

  Object.keys(byDifficulty).forEach(difficulty => {
    const answers = byDifficulty[difficulty];
    performance[difficulty] = {
      accuracy: answers.filter(a => a.isCorrect).length / answers.length,
      averageTime: calculateMean(answers.map(a => a.timeSpent)),
      questionCount: answers.length
    };
  });

  return {
    overall: {
      accuracy: examAnswers.filter(a => a.isCorrect).length / examAnswers.length,
      averageTime: calculateMean(examAnswers.map(a => a.timeSpent))
    },
    byDifficulty: performance
  };
}

function analyzeIntegrity(examAnswers) {
  const metricsWithBehavior = examAnswers.filter(a => a.behaviorAnalytics);
  
  return {
    suspiciousActivities: {
      copyPaste: metricsWithBehavior.filter(a => a.behaviorAnalytics.pasteFromExternal).length,
      devTools: metricsWithBehavior.filter(a => a.behaviorAnalytics.devToolsOpened).length,
      unusualTyping: metricsWithBehavior.filter(a => a.behaviorAnalytics.suspiciousTypingSpeed).length,
      excessiveTabSwitching: metricsWithBehavior.filter(a => a.behaviorAnalytics.tabSwitches > 5).length
    },
    attentionMetrics: {
      averageFocusScore: calculateMean(metricsWithBehavior.map(a => a.behaviorAnalytics.focusScore)),
      lowFocusCount: metricsWithBehavior.filter(a => a.behaviorAnalytics.focusScore < 0.5).length
    }
  };
}

function generateGeneralRecommendations(report) {
  const recommendations = [];
  
  // Overall performance recommendations
  if (report.performanceAnalysis.overall.accuracy < 0.6) {
    recommendations.push({
      type: 'curriculum',
      priority: 'high',
      message: 'Overall exam accuracy is low. Consider reviewing curriculum difficulty and teaching methods.'
    });
  }

  // Integrity recommendations
  const totalSuspicious = Object.values(report.integrityAnalysis.suspiciousActivities)
    .reduce((sum, count) => sum + count, 0);
  
  if (totalSuspicious > report.summary.totalAnswers * 0.05) {
    recommendations.push({
      type: 'security',
      priority: 'high',
      message: 'Higher than expected suspicious activity detected. Review exam security measures.'
    });
  }

  return recommendations;
}

module.exports = {
  analyzeTypingBehavior,
  analyzeStudentProfile,
  detectAnomalies,
  generateResearchInsights,
  generateAnalyticsReport,
  analyzePerformance,
  analyzeIntegrity
}; 