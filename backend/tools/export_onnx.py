"""
Export Depth Anything V2 Small to ONNX and make an int8-quantised copy.

Run on a dev machine (needs torch, onnx, onnxruntime, onnxscript), from the backend folder:
    python tools/export_onnx.py
Writes ai_models/checkpoints/depth_anything_v2_vits.onnx and depth_anything_v2_vits_int8.onnx.
The backend only needs onnxruntime at runtime.
"""
import os
import sys

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.shape_inference import quant_pre_process

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai_models.Depth_Anything_V2.depth_anything_v2.dpt import DepthAnythingV2  # noqa: E402

SIZE = 518  # the backend always resizes to 518x518 before inference
CHECKPOINTS = "ai_models/checkpoints"
FP32 = f"{CHECKPOINTS}/depth_anything_v2_vits.onnx"
INT8 = f"{CHECKPOINTS}/depth_anything_v2_vits_int8.onnx"

model = DepthAnythingV2(encoder="vits", features=64, out_channels=[48, 96, 192, 384])
model.load_state_dict(torch.load(f"{CHECKPOINTS}/depth_anything_v2_vits.pth", map_location="cpu"))
model.eval()

dummy = torch.randn(1, 3, SIZE, SIZE)
with torch.inference_mode():
    torch.onnx.export(model, (dummy,), FP32, input_names=["image"], output_names=["depth"],
                      opset_version=18, dynamo=False)
print("exported", FP32, f"{os.path.getsize(FP32) / 1e6:.0f} MB")

# Shape inference + graph clean-up first gives the quantiser a cleaner graph to work on
preprocessed = FP32.replace(".onnx", "_pre.onnx")
quant_pre_process(FP32, preprocessed)
# Dynamic quantisation: int8 weights, activations quantised on the fly. No calibration data needed,
# and it targets MatMul, which is where a ViT spends nearly all its time.
quantize_dynamic(preprocessed, INT8, weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"])
os.remove(preprocessed)
print("quantised", INT8, f"{os.path.getsize(INT8) / 1e6:.0f} MB")
