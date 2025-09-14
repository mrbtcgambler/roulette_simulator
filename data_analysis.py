import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import base64
import plotly.io as pio
from tqdm import tqdm

# --- Configuration ---
# Update this path to the location of your log file
log_file_path = r'R:\Temp\roulette_log.csv'
# The name of the output HTML file
output_html_path = 'analysis_report.html'
# IMPORTANT: You may need to install the kaleido and tqdm packages
# Run: pip install kaleido tqdm
pio.kaleido.chromium_args = ("--headless", "--no-sandbox")


# --- Data Loading with Progress Bar ---
try:
    print(f"Reading data from {log_file_path}...")
    # Use chunking to read the large CSV file and show a progress bar
    chunk_iter = pd.read_csv(log_file_path, chunksize=1_000_000)
    
    # Get total rows for tqdm progress bar (this can be slow, but it's for good UI)
    print("Determining file size for progress bar...")
    with open(log_file_path) as f:
        total_lines = sum(1 for line in f) -1 # -1 for header

    df = pd.concat(tqdm(chunk_iter, total=total_lines // 1_000_000 + 1, desc="Loading CSV Chunks"))

    print("\nData loaded successfully.")
    print(f"Total bets analyzed: {len(df)}")

except FileNotFoundError:
    print(f"Error: The file was not found at {log_file_path}")
    exit()

# --- Data Analysis & Visualization ---

# --- NEW: Aggregation for High-Performance Trend Charts ---
# Instead of plotting millions of points, we group the data into bins
# and plot the average for each bin. This preserves the trend perfectly.
n_bins = 50000 # We will render 50k points instead of millions
if len(df) > n_bins:
    print(f"Dataset is large. Aggregating data into {n_bins} bins for trend charts.")
    # Create a new column to group by
    df['bin'] = pd.cut(df['betCount'], bins=n_bins, labels=False)
    # Group by the bins and calculate the mean for relevant columns
    df_agg = df.groupby('bin')[['betCount', 'balance', 'currentStreak']].mean()
else:
    # If the dataset is small, no aggregation is needed
    df_agg = df

print("\nGenerating visualizations...")
tqdm.pandas(desc="Chart Generation Progress")

# 1. Balance Over Time (Line Chart) - STATIC & AGGREGATED
print("1/6: Generating Balance chart (static)...")
fig_balance = px.line(
    df_agg,
    x='betCount',
    y='balance',
    title='Balance Over Time (Aggregated)',
    labels={'betCount': 'Bet Count', 'balance': 'Balance (TRX)'}
)
fig_balance.update_layout(title_x=0.5)

# 2. Outcome Distribution (Pie Chart) - INTERACTIVE
print("2/6: Generating Outcome chart...")
outcome_counts = df['outcome'].value_counts()
fig_pie = px.pie(
    names=outcome_counts.index,
    values=outcome_counts.values,
    title='Distribution of Outcomes',
    color_discrete_map={'win':'green', 'lose':'red', 'push':'blue'}
)
fig_pie.update_layout(title_x=0.5)

# 3. Losing Streak Distribution (Histogram) - INTERACTIVE
print("3/6: Generating Losing Streak chart...")
losing_streaks = df[df['currentStreak'] < 0]['currentStreak'].abs()
streak_counts = losing_streaks.value_counts().sort_index()

fig_hist = go.Figure(go.Bar(
    x=streak_counts.index,
    y=streak_counts.values,
    text=streak_counts.values,
    texttemplate='%{text:.2s}',
    textposition='outside',
    marker_color='orange'
))

# Calculate and add percentile lines
p95 = losing_streaks.quantile(0.95)
p99 = losing_streaks.quantile(0.99)

fig_hist.add_vline(x=p95, line_width=2, line_dash="dash", line_color="teal", 
                  annotation_text=f"95th Percentile ({p95:.0f})", 
                  annotation_position="top left")
fig_hist.add_vline(x=p99, line_width=2, line_dash="dash", line_color="purple", 
                  annotation_text=f"99th Percentile ({p99:.0f})", 
                  annotation_position="top right")

fig_hist.update_layout(
    title_text='Distribution of Losing Streak Lengths (with Percentiles)',
    xaxis_title="Length of Losing Streak",
    yaxis_title="Frequency (Count)",
    title_x=0.5,
    bargap=0.2
)


# 4. Roll Result Distribution (Bar Chart) - INTERACTIVE
print("4/6: Generating Roll Distribution chart...")
roll_counts = df['roll'].value_counts().sort_index()
fig_rolls = px.bar(
    x=roll_counts.index,
    y=roll_counts.values,
    title='Distribution of Roll Results (0-36)'
)
fig_rolls.update_layout(title_x=0.5)
fig_rolls.update_xaxes(range=[-0.5, 36.5])

# 5. Win/Loss Streak Progression (Line Chart) - STATIC & AGGREGATED
print("5/6: Generating Streak Progression chart (static)...")
fig_streaks = px.line(
    df_agg,
    x='betCount',
    y='currentStreak',
    title='Win/Loss Streak Progression (Aggregated)',
    labels={'betCount': 'Bet Count', 'currentStreak': 'Streak Length'}
)
fig_streaks.add_hline(y=0, line_dash="dash", line_color="grey")
fig_streaks.update_layout(title_x=0.5)

# 6. Frequency of All Streak Lengths (Bar Chart) - INTERACTIVE
print("6/6: Generating All Streaks chart...")
streak_counts_all = df['currentStreak'].value_counts().sort_index()
colors = ['green' if i > 0 else 'red' for i in streak_counts_all.index]
fig_all_streaks = go.Figure(go.Bar(
    x=streak_counts_all.index,
    y=streak_counts_all.values,
    marker_color=colors,
    text=streak_counts_all.values,
    texttemplate='%{text:.2s}', # Format text to SI units (e.g., 1.5M)
    textposition='outside'
))
fig_all_streaks.update_layout(
    title_text='Frequency of All Streak Lengths',
    title_x=0.5,
    uniformtext_minsize=8,
    uniformtext_mode='hide'
)

# --- Helper Function for Static Image Embedding ---
def fig_to_base_64_img(fig):
    img_bytes = fig.to_image(format='png', width=1200, height=600, scale=1.5)
    base64_string = base64.b64encode(img_bytes).decode('utf-8')
    return f'<img src="data:image/png;base64,{base64_string}" style="width: 100%; height: auto;">'

# --- HTML Report Generation ---
print(f"\nCreating HTML report at {output_html_path}...")
with open(output_html_path, 'w') as f:
    f.write("<html><head><title>Roulette Analysis</title><style>body{font-family:Arial,sans-serif;margin:2em;background-color:#f4f4f4;}h1{text-align:center;}.chart-container{width:90%;margin:2em auto;border:1px solid #ddd;box-shadow:0 4px 8px 0 rgba(0,0,0,0.2);background-color:white;padding:1em;}</style></head><body><h1>Roulette Simulation Analysis Report</h1>")
    
    for i, fig in enumerate([fig_balance, fig_pie, fig_hist, fig_rolls, fig_streaks, fig_all_streaks], 1):
        print(f"Embedding chart {i}/6...")
        f.write('<div class="chart-container">')
        if fig in [fig_balance, fig_streaks]: # Static charts
            f.write(fig_to_base_64_img(fig))
        else: # Interactive charts
            f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
        f.write('</div>')

    f.write("</body></html>")

print("\nReport generation complete.")

