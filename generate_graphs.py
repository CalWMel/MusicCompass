import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# 1. Formatting Configuration for Academic style
sns.set_theme(style="whitegrid")
plt.rcParams.update({'font.size': 12, 'font.family': 'sans-serif'})

# 2. Load the Data
df = pd.read_csv('master-data-log.csv')

# =====================================================================
# GRAPH 1: OVERALL COMPLETION TIMES (Confidence Interval Plot)
# =====================================================================
plt.figure(figsize=(6, 5))
# Prepare data specifically for this plot
time_data = pd.DataFrame({
    'Mode': ['Clutch'] * len(df) + ['Always-On'] * len(df),
    'Average Time (s)': df['C_Total_Avg'].tolist() + df['AO_Total_Avg'].tolist()
})

# Euan's requested CI plot (Pointplot)
ax1 = sns.pointplot(
    data=time_data, x='Mode', y='Average Time (s)', 
    errorbar=('ci', 95), capsize=.1, join=False, 
    markers="o", scale=1.5, color="#2c3e50"
)
plt.title('Mean Task Completion Time by Mode\n(with 95% Confidence Intervals)', pad=15, fontweight='bold')
plt.ylabel('Time (Seconds)')
plt.xlabel('Navigation Mode')
plt.tight_layout()
plt.savefig('Fig1_Completion_Times_CI.png', dpi=300)
plt.show()

# =====================================================================
# GRAPH 2: THE LEARNING CURVE (Time over Trials)
# =====================================================================
plt.figure(figsize=(8, 5))

# We need to melt the data into "Long format" so Seaborn can track the trials
learning_df = pd.DataFrame()

# Extracting Artist trials to show navigation learning
for i in range(1, 4):
    temp_c = pd.DataFrame({'Trial': [f'Trial {i}']*len(df), 'Time': df[f'C_Art{i}'], 'Mode': ['Clutch']*len(df)})
    temp_ao = pd.DataFrame({'Trial': [f'Trial {i}']*len(df), 'Time': df[f'AO_Art{i}'], 'Mode': ['Always-On']*len(df)})
    learning_df = pd.concat([learning_df, temp_c, temp_ao])

# Line plot with shaded 95% Confidence Interval bands
ax2 = sns.lineplot(
    data=learning_df, x='Trial', y='Time', hue='Mode', 
    marker="o", err_style="bars", err_kws={'capsize': 5},
    palette=["#e74c3c", "#3498db"], linewidth=2, markersize=8
)
plt.title('Learning Effect: Artist Search Time Across Trials', pad=15, fontweight='bold')
plt.ylabel('Time (Seconds)')
plt.xlabel('Attempt Number')
plt.legend(title='Mode')
plt.tight_layout()
plt.savefig('Fig2_Learning_Curve_CI.png', dpi=300)
plt.show()

# =====================================================================
# GRAPH 3: ERROR RATES (Backtracks)
# =====================================================================
plt.figure(figsize=(6, 5))
error_data = pd.DataFrame({
    'Mode': ['Clutch'] * len(df) + ['Always-On'] * len(df),
    'Errors': df['C_Err_Total'].tolist() + df['AO_Err_Total'].tolist()
})

ax3 = sns.pointplot(
    data=error_data, x='Mode', y='Errors', 
    errorbar=('ci', 95), capsize=.1, join=False, 
    markers="D", scale=1.5, color="#8e44ad"
)
plt.title('Mean Navigation Errors (Backtracks) by Mode\n(with 95% Confidence Intervals)', pad=15, fontweight='bold')
plt.ylabel('Number of Errors (Shakes)')
plt.xlabel('Navigation Mode')
plt.tight_layout()
plt.savefig('Fig3_Error_Rates_CI.png', dpi=300)
plt.show()

print("Graphs successfully generated and saved as PNGs!")